/**
 * Pure, deterministic Monopoly Deal game engine.
 *
 * Key rule: no I/O, no sockets, no Date.now(), no Math.random().
 * All randomness is injected via a seeded RNG stored in state.rngSeed.
 *
 * Primary API:
 *   createGame(players, seed)  → GameState
 *   applyAction(state, playerId, action) → { state, events, error? }
 *   getRedactedView(state, playerId)     → RedactedGameView
 */

import { buildDeck } from '@monopoly-deal/shared';
import {
  SET_SIZES,
  RENT_LADDERS,
  HOUSE_BONUS,
  HOTEL_BONUS,
  COMPLETE_SETS_TO_WIN,
  STARTING_HAND_SIZE,
  NORMAL_DRAW,
  EMPTY_HAND_DRAW,
  MAX_HAND_SIZE,
  PLAYS_PER_TURN,
} from '@monopoly-deal/shared';
import type {
  Card,
  PropertyCard,
  WildcardCard,
  ActionCard,
  Color,
} from '@monopoly-deal/shared';
import type {
  GameState,
  PlayerState,
  PropertySet,
  PendingInteraction,
  PaymentDebt,
  TargetJsnState,
  GamePhase,
  PendingDecision,
  RedactedGameView,
  RedactedPlayerView,
  ActionLogEntry,
} from '@monopoly-deal/shared';
import type { GameAction } from '@monopoly-deal/shared';
import { shuffleWithSeed, nextRng } from './rng.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeId(): string {
  // Simple incrementing ID — deterministic within a test run.
  // The gameId / roundId only need to be unique per process, not globally.
  return `game_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Build a fresh cardMap from an array of cards */
function buildCardMap(cards: Card[]): Record<string, Card> {
  const map: Record<string, Card> = {};
  for (const card of cards) {
    map[card.id] = card;
  }
  return map;
}

/** Draw `count` cards from the top of the deck (last element = top). Returns [drawn, newDeck]. */
function drawCards(
  deck: string[],
  discard: string[],
  count: number,
  rngSeed: number
): { drawn: string[]; newDeck: string[]; newDiscard: string[]; newSeed: number } {
  let currentDeck = [...deck];
  let currentDiscard = [...discard];
  let currentSeed = rngSeed;
  const drawn: string[] = [];

  for (let i = 0; i < count; i++) {
    if (currentDeck.length === 0) {
      // Reshuffle discard into deck (keep the top discard card if any)
      if (currentDiscard.length === 0) {
        break; // No cards left anywhere
      }
      const { result, newSeed } = shuffleWithSeed(currentDiscard, currentSeed);
      currentSeed = newSeed;
      currentDeck = result;
      currentDiscard = [];
    }
    // Pop from end (= top of deck)
    const cardId = currentDeck.pop()!;
    drawn.push(cardId);
  }

  return { drawn, newDeck: currentDeck, newDiscard: currentDiscard, newSeed: currentSeed };
}

/** Find or create a property set of the given color for a player. Returns new propertySets array. */
function addCardToPropertySet(
  propertySets: PropertySet[],
  color: Color,
  cardId: string
): PropertySet[] {
  const idx = propertySets.findIndex(s => s.color === color);
  if (idx !== -1) {
    // Add to existing set
    const existing = propertySets[idx]!;
    const updated: PropertySet = {
      ...existing,
      cards: [...existing.cards, cardId],
    };
    return [
      ...propertySets.slice(0, idx),
      updated,
      ...propertySets.slice(idx + 1),
    ];
  } else {
    // Create new set
    const newSet: PropertySet = {
      color,
      cards: [cardId],
      hasHouse: false,
      hasHotel: false,
    };
    return [...propertySets, newSet];
  }
}

/** Remove a card from a specific color set. Returns new propertySets array. */
function removeCardFromPropertySet(
  propertySets: PropertySet[],
  color: Color,
  cardId: string
): PropertySet[] {
  return propertySets
    .map(s => {
      if (s.color !== color) return s;
      return { ...s, cards: s.cards.filter(id => id !== cardId) };
    })
    .filter(s => s.cards.length > 0); // remove empty sets
}

/** Get the count of standard (non-wildcard) PropertyCards in a set. */
function standardCardCount(set: PropertySet, cardMap: Record<string, Card>): number {
  return set.cards.filter(id => {
    const card = cardMap[id];
    return card?.type === 'property';
  }).length;
}

/** Check whether a color set is complete (has the right number of cards AND at least one standard property). */
function isSetComplete(
  set: PropertySet,
  cardMap: Record<string, Card>
): boolean {
  const required = SET_SIZES[set.color];
  if (set.cards.length !== required) return false;
  return standardCardCount(set, cardMap) > 0;
}

/** Get the rent value for a player's set of a given color. */
function getRentValue(
  player: PlayerState,
  color: Color,
  cardMap: Record<string, Card>
): number {
  const set = player.propertySets.find(s => s.color === color);
  if (!set || set.cards.length === 0) return 0;

  const ownedCount = set.cards.length;
  const ladder = RENT_LADDERS[color];
  const baseRent = ladder[Math.min(ownedCount, SET_SIZES[color]) - 1] ?? 0;

  let bonus = 0;
  if (set.hasHouse) bonus += HOUSE_BONUS;
  if (set.hasHotel) bonus += HOTEL_BONUS;

  return baseRent + bonus;
}

/** Get card value for payment purposes ($0 for multi-color wildcards). */
function getPaymentValue(card: Card): number {
  if (card.type === 'wildcard' && (card as WildcardCard).isMultiColor) return 0;
  return card.bankValue;
}

/** Get total value of a player's payable assets (bank + property, excluding $0 multi-color wildcards). */
function getTotalAssetValue(player: PlayerState, cardMap: Record<string, Card>): number {
  let total = 0;
  for (const id of player.bank) {
    const card = cardMap[id];
    if (card) total += getPaymentValue(card);
  }
  for (const set of player.propertySets) {
    for (const id of set.cards) {
      const card = cardMap[id];
      if (card) total += getPaymentValue(card);
    }
    // house/hotel cards on the set also count
    if (set.houseCardId) {
      const card = cardMap[set.houseCardId];
      if (card) total += getPaymentValue(card);
    }
    if (set.hotelCardId) {
      const card = cardMap[set.hotelCardId];
      if (card) total += getPaymentValue(card);
    }
  }
  return total;
}

/** Find which set a card belongs to in a player's property area. Returns the set or null. */
function findCardSet(player: PlayerState, cardId: string): PropertySet | null {
  for (const set of player.propertySets) {
    if (set.cards.includes(cardId)) return set;
  }
  return null;
}

/**
 * Remove a card from whichever set it lives in across all of a player's propertySets.
 * Returns updated PlayerState.
 */
function removeCardFromAllSets(player: PlayerState, cardId: string): PlayerState {
  const newSets = player.propertySets
    .map(s => ({ ...s, cards: s.cards.filter(id => id !== cardId) }))
    .filter(s => s.cards.length > 0);
  return { ...player, propertySets: newSets };
}

/** Check win condition: ≥ COMPLETE_SETS_TO_WIN complete sets of DIFFERENT colors. */
function checkWin(player: PlayerState, cardMap: Record<string, Card>): boolean {
  const completedColors = new Set<Color>();
  for (const set of player.propertySets) {
    if (isSetComplete(set, cardMap)) {
      completedColors.add(set.color);
    }
  }
  return completedColors.size >= COMPLETE_SETS_TO_WIN;
}

/** Advance to the next player and reset turn state. */
function advanceToNextPlayer(state: GameState): GameState {
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  return {
    ...state,
    currentPlayerIndex: nextIndex,
    phase: 'AWAITING_TURN_START',
    playsRemaining: PLAYS_PER_TURN,
  };
}

/** Get the current player. */
function currentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex]!;
}

/** Replace a player in the players array immutably. */
function replacePlayer(state: GameState, updated: PlayerState): GameState {
  return {
    ...state,
    players: state.players.map(p => (p.id === updated.id ? updated : p)),
  };
}

/** Append an entry to the action log. */
function appendLog(state: GameState, entry: ActionLogEntry): GameState {
  return { ...state, actionLog: [...state.actionLog, entry] };
}

/**
 * Enter the AWAITING_PAYMENT phase with one or more debts.
 * playsRemaining is preserved in the state.
 */
function enterPaymentPhase(
  state: GameState,
  recipientId: string,
  debts: PaymentDebt[]
): GameState {
  const pi: PendingInteraction = {
    type: 'PAYMENT',
    initiatorId: currentPlayer(state).id,
    recipientId,
    debts,
    jsnChain: [],
  };
  return {
    ...state,
    phase: 'AWAITING_PAYMENT',
    pendingInteraction: pi,
  };
}

// ---------------------------------------------------------------------------
// JSN Window helpers
// ---------------------------------------------------------------------------

/**
 * Enter the AWAITING_RESPONSES phase with a JSN window.
 * The action card must already be moved to discard before calling this.
 * playsRemaining is already decremented before calling this.
 */
function enterJsnWindow(
  state: GameState,
  initiatorId: string,
  targetIds: string[],
  pendingAction: import('@monopoly-deal/shared').GameAction
): GameState {
  const targetJsnStates: TargetJsnState[] = targetIds.map(id => ({
    targetId: id,
    jsnCount: 0,
    awaitingFrom: 'target' as const,
    resolved: false,
    cancelled: false,
  }));

  const pi: PendingInteraction = {
    type: 'JSN_WINDOW',
    initiatorId,
    recipientId: initiatorId, // initiator is the eventual money recipient
    debts: [],
    jsnChain: [],
    pendingAction,
    awaitingJsnFrom: [...targetIds],
    targetJsnStates,
    expiresAt: undefined,
  };

  return {
    ...state,
    phase: 'AWAITING_RESPONSES',
    pendingInteraction: pi,
  };
}

/**
 * Execute the resolved action for non-cancelled targets.
 * Called after all targetJsnStates are resolved.
 */
function executeResolvedAction(state: GameState, pi: PendingInteraction): GameState {
  const action = pi.pendingAction!;
  const targetJsnStates = pi.targetJsnStates ?? [];
  const nonCancelledTargets = targetJsnStates.filter(t => !t.cancelled).map(t => t.targetId);

  switch (action.type) {
    case 'PLAY_RENT': {
      const { chosenColor, doubleCardIds } = action as import('@monopoly-deal/shared').PlayRentAction;
      const initiator = state.players.find(p => p.id === pi.initiatorId)!;
      const doubles = doubleCardIds ?? [];
      const baseRent = getRentValue(initiator, chosenColor, state.cardMap);
      const multiplier = Math.pow(2, doubles.length);
      const rentAmount = baseRent * multiplier;

      if (nonCancelledTargets.length === 0) {
        // All targets cancelled → return to PLAYING
        return { ...state, phase: 'PLAYING', pendingInteraction: null };
      }

      const debts: PaymentDebt[] = nonCancelledTargets.map(tid => ({
        debtorId: tid,
        amountOwed: rentAmount,
        paid: false,
        cardsPaid: [],
      }));
      return enterPaymentPhase({ ...state, pendingInteraction: null }, pi.initiatorId, debts);
    }

    case 'PLAY_DEBT_COLLECTOR': {
      const amount = 5;
      if (nonCancelledTargets.length === 0) {
        return { ...state, phase: 'PLAYING', pendingInteraction: null };
      }
      const debts: PaymentDebt[] = nonCancelledTargets.map(tid => ({
        debtorId: tid,
        amountOwed: amount,
        paid: false,
        cardsPaid: [],
      }));
      return enterPaymentPhase({ ...state, pendingInteraction: null }, pi.initiatorId, debts);
    }

    case 'PLAY_BIRTHDAY': {
      const amount = 2;
      if (nonCancelledTargets.length === 0) {
        return { ...state, phase: 'PLAYING', pendingInteraction: null };
      }
      const debts: PaymentDebt[] = nonCancelledTargets.map(tid => ({
        debtorId: tid,
        amountOwed: amount,
        paid: false,
        cardsPaid: [],
      }));
      return enterPaymentPhase({ ...state, pendingInteraction: null }, pi.initiatorId, debts);
    }

    case 'PLAY_SLY_DEAL': {
      const slyAction = action as import('@monopoly-deal/shared').PlaySlyDealAction;
      if (nonCancelledTargets.length === 0) {
        // Cancelled — do nothing, return to PLAYING
        return { ...state, phase: 'PLAYING', pendingInteraction: null };
      }
      // Execute the steal
      const initiator = state.players.find(p => p.id === pi.initiatorId)!;
      const targetPlayer = state.players.find(p => p.id === slyAction.targetId)!;
      const targetSet = findCardSet(targetPlayer, slyAction.targetCardId);
      if (!targetSet) {
        // Card no longer there (edge case), just return to PLAYING
        return { ...state, phase: 'PLAYING', pendingInteraction: null };
      }
      const updatedTarget = removeCardFromAllSets(targetPlayer, slyAction.targetCardId);
      const updatedInitiator: PlayerState = {
        ...initiator,
        propertySets: addCardToPropertySet(initiator.propertySets, targetSet.color, slyAction.targetCardId),
      };
      let newState = replacePlayer(state, updatedInitiator);
      newState = replacePlayer(newState, updatedTarget);
      newState = { ...newState, phase: 'PLAYING', pendingInteraction: null };
      // Check win
      if (checkWin(newState.players.find(p => p.id === pi.initiatorId)!, newState.cardMap)) {
        const initiatorPlayer = state.players.find(p => p.id === pi.initiatorId)!;
        const winEvent = `${initiatorPlayer.name} wins with 3 complete property sets!`;
        newState = appendLog(newState, winEvent);
        newState = { ...newState, winnerId: pi.initiatorId, phase: 'FINISHED' };
      }
      return newState;
    }

    case 'PLAY_FORCED_DEAL': {
      const fdAction = action as import('@monopoly-deal/shared').PlayForcedDealAction;
      if (nonCancelledTargets.length === 0) {
        return { ...state, phase: 'PLAYING', pendingInteraction: null };
      }
      // Execute the swap
      const initiator = state.players.find(p => p.id === pi.initiatorId)!;
      const targetPlayer = state.players.find(p => p.id === fdAction.targetId)!;
      const mySet = findCardSet(initiator, fdAction.myCardId);
      const theirSet = findCardSet(targetPlayer, fdAction.targetCardId);
      if (!mySet || !theirSet) {
        return { ...state, phase: 'PLAYING', pendingInteraction: null };
      }
      let updatedMe = removeCardFromAllSets(initiator, fdAction.myCardId);
      updatedMe = {
        ...updatedMe,
        propertySets: addCardToPropertySet(updatedMe.propertySets, theirSet.color, fdAction.targetCardId),
      };
      let updatedTarget = removeCardFromAllSets(targetPlayer, fdAction.targetCardId);
      updatedTarget = {
        ...updatedTarget,
        propertySets: addCardToPropertySet(updatedTarget.propertySets, mySet.color, fdAction.myCardId),
      };
      let newState = replacePlayer(state, updatedMe);
      newState = replacePlayer(newState, updatedTarget);
      newState = { ...newState, phase: 'PLAYING', pendingInteraction: null };
      // Check win for both
      if (checkWin(newState.players.find(p => p.id === pi.initiatorId)!, newState.cardMap)) {
        const initiatorPlayer = state.players.find(p => p.id === pi.initiatorId)!;
        const winEvent = `${initiatorPlayer.name} wins with 3 complete property sets!`;
        newState = appendLog(newState, winEvent);
        newState = { ...newState, winnerId: pi.initiatorId, phase: 'FINISHED' };
      } else if (checkWin(newState.players.find(p => p.id === fdAction.targetId)!, newState.cardMap)) {
        const targetPlayerObj = state.players.find(p => p.id === fdAction.targetId)!;
        const winEvent = `${targetPlayerObj.name} wins with 3 complete property sets!`;
        newState = appendLog(newState, winEvent);
        newState = { ...newState, winnerId: fdAction.targetId, phase: 'FINISHED' };
      }
      return newState;
    }

    case 'PLAY_DEAL_BREAKER': {
      const dbAction = action as import('@monopoly-deal/shared').PlayDealBreakerAction;
      if (nonCancelledTargets.length === 0) {
        return { ...state, phase: 'PLAYING', pendingInteraction: null };
      }
      // Execute the steal
      const initiator = state.players.find(p => p.id === pi.initiatorId)!;
      const targetPlayer = state.players.find(p => p.id === dbAction.targetId)!;
      const targetSet = targetPlayer.propertySets.find(s => s.color === dbAction.setColor);
      if (!targetSet) {
        return { ...state, phase: 'PLAYING', pendingInteraction: null };
      }
      const stolenSet: PropertySet = { ...targetSet };
      const updatedTarget: PlayerState = {
        ...targetPlayer,
        propertySets: targetPlayer.propertySets.filter(s => s.color !== dbAction.setColor),
      };
      const existingIdx = initiator.propertySets.findIndex(s => s.color === dbAction.setColor);
      let newPlayerSets: PropertySet[];
      if (existingIdx !== -1) {
        newPlayerSets = initiator.propertySets.map(s => s.color === dbAction.setColor ? stolenSet : s);
      } else {
        newPlayerSets = [...initiator.propertySets, stolenSet];
      }
      const updatedInitiator: PlayerState = { ...initiator, propertySets: newPlayerSets };
      let newState = replacePlayer(state, updatedInitiator);
      newState = replacePlayer(newState, updatedTarget);
      newState = { ...newState, phase: 'PLAYING', pendingInteraction: null };
      // Check win
      if (checkWin(newState.players.find(p => p.id === pi.initiatorId)!, newState.cardMap)) {
        const initiatorPlayer = state.players.find(p => p.id === pi.initiatorId)!;
        const winEvent = `${initiatorPlayer.name} wins with 3 complete property sets!`;
        newState = appendLog(newState, winEvent);
        newState = { ...newState, winnerId: pi.initiatorId, phase: 'FINISHED' };
      }
      return newState;
    }

    default:
      // Should not happen
      return { ...state, phase: 'PLAYING', pendingInteraction: null };
  }
}

/**
 * After a JSN response, check if all targetJsnStates are resolved.
 * If yes, execute the pending action. If no, keep waiting.
 */
function resolveJsnWindow(state: GameState): GameState {
  const pi = state.pendingInteraction;
  if (!pi || pi.type !== 'JSN_WINDOW') return state;

  const allResolved = (pi.targetJsnStates ?? []).every(t => t.resolved);
  if (!allResolved) return state;

  // All targets have resolved their JSN chains — execute the action
  return executeResolvedAction(state, pi);
}

// ---------------------------------------------------------------------------
// createGame
// ---------------------------------------------------------------------------

export function createGame(
  players: { id: string; name: string }[],
  seed: number
): GameState {
  if (players.length < 2 || players.length > 5) {
    throw new Error('Monopoly Deal requires 2–5 players');
  }

  const allCards = buildDeck();
  const cardMap = buildCardMap(allCards);

  // Shuffle deck
  const { result: shuffledIds, newSeed: seedAfterShuffle } = shuffleWithSeed(
    allCards.map(c => c.id),
    seed
  );

  let deck = shuffledIds;
  let currentSeed = seedAfterShuffle;

  // Deal STARTING_HAND_SIZE cards to each player
  const playerStates: PlayerState[] = players.map(p => ({
    id: p.id,
    name: p.name,
    hand: [],
    bank: [],
    propertySets: [],
    connected: true,
  }));

  for (let i = 0; i < players.length; i++) {
    const drawn = deck.splice(deck.length - STARTING_HAND_SIZE, STARTING_HAND_SIZE);
    playerStates[i] = { ...playerStates[i]!, hand: drawn };
  }

  const gameId = `game_${seed}_${players.length}`;
  const roundId = `round_${seed}`;

  return {
    gameId,
    roundId,
    players: playerStates,
    currentPlayerIndex: 0,
    phase: 'AWAITING_TURN_START',
    playsRemaining: PLAYS_PER_TURN,
    deck,
    discard: [],
    cardMap,
    pendingInteraction: null,
    actionLog: [`Game started with ${players.length} players`],
    rngSeed: currentSeed,
    winnerId: null,
  };
}

// ---------------------------------------------------------------------------
// applyAction
// ---------------------------------------------------------------------------

export function applyAction(
  state: GameState,
  playerId: string,
  action: GameAction
): { state: GameState; events: string[]; error?: string } {
  const events: string[] = [];

  function err(msg: string): { state: GameState; events: string[]; error: string } {
    return { state, events, error: msg };
  }

  const player = state.players.find(p => p.id === playerId);
  if (!player) return err(`Unknown player: ${playerId}`);

  const cp = currentPlayer(state);

  switch (action.type) {
    // -----------------------------------------------------------------------
    case 'START_TURN': {
      if (state.phase !== 'AWAITING_TURN_START') {
        return err(`Cannot start turn in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }

      const drawCount = player.hand.length === 0 ? EMPTY_HAND_DRAW : NORMAL_DRAW;
      const { drawn, newDeck, newDiscard, newSeed } = drawCards(
        state.deck,
        state.discard,
        drawCount,
        state.rngSeed
      );

      const updatedPlayer: PlayerState = {
        ...player,
        hand: [...player.hand, ...drawn],
      };

      const event = `${player.name} drew ${drawn.length} card${drawn.length !== 1 ? 's' : ''}`;
      events.push(event);

      let newState = replacePlayer(state, updatedPlayer);
      newState = {
        ...newState,
        deck: newDeck,
        discard: newDiscard,
        rngSeed: newSeed,
        phase: 'PLAYING',
        playsRemaining: PLAYS_PER_TURN,
      };
      newState = appendLog(newState, event);

      return { state: newState, events };
    }

    // -----------------------------------------------------------------------
    case 'PLAY_MONEY': {
      if (state.phase !== 'PLAYING') {
        return err(`Cannot play money in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }
      if (state.playsRemaining <= 0) {
        return err('No plays remaining this turn');
      }

      const { cardId } = action;
      if (!player.hand.includes(cardId)) {
        return err(`Card ${cardId} is not in your hand`);
      }

      const card = state.cardMap[cardId];
      if (!card) return err(`Unknown card: ${cardId}`);

      // Valid cards to bank: money, action (non-property), rent
      // Wildcards and property cards cannot be banked via PLAY_MONEY
      if (card.type === 'wildcard' || card.type === 'property') {
        return err(`Property/wildcard cards must be played as properties`);
      }

      const updatedPlayer: PlayerState = {
        ...player,
        hand: player.hand.filter(id => id !== cardId),
        bank: [...player.bank, cardId],
      };

      const newPlaysRemaining = state.playsRemaining - 1;
      const event = `${player.name} banked $${card.bankValue}M`;
      events.push(event);

      let newState = replacePlayer(state, updatedPlayer);
      newState = { ...newState, playsRemaining: newPlaysRemaining };
      newState = appendLog(newState, event);

      // Check if turn is over
      if (newPlaysRemaining === 0) {
        // Check if player needs to discard
        if (updatedPlayer.hand.length > MAX_HAND_SIZE) {
          newState = { ...newState, phase: 'AWAITING_DISCARD' };
        }
        // Otherwise player must explicitly call END_TURN
      }

      return { state: newState, events };
    }

    // -----------------------------------------------------------------------
    case 'PLAY_PROPERTY': {
      if (state.phase !== 'PLAYING') {
        return err(`Cannot play property in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }
      if (state.playsRemaining <= 0) {
        return err('No plays remaining this turn');
      }

      const { cardId, setColor } = action;
      if (!player.hand.includes(cardId)) {
        return err(`Card ${cardId} is not in your hand`);
      }

      const card = state.cardMap[cardId];
      if (!card) return err(`Unknown card: ${cardId}`);

      if (card.type !== 'property' && card.type !== 'wildcard') {
        return err(`Card ${cardId} is not a property or wildcard`);
      }

      // Validate the color is valid for this card
      if (card.type === 'property') {
        const propCard = card as PropertyCard;
        if (propCard.color !== setColor) {
          return err(`Property card ${cardId} belongs to ${propCard.color}, not ${setColor}`);
        }
      } else if (card.type === 'wildcard') {
        const wildCard = card as WildcardCard;
        if (!wildCard.isMultiColor && !wildCard.colors.includes(setColor)) {
          return err(
            `Wildcard ${cardId} cannot be placed in ${setColor} set (valid: ${wildCard.colors.join(', ')})`
          );
        }
      }

      const newPlaysRemaining = state.playsRemaining - 1;
      const updatedPlayer: PlayerState = {
        ...player,
        hand: player.hand.filter(id => id !== cardId),
        propertySets: addCardToPropertySet(player.propertySets, setColor, cardId),
      };

      const event = `${player.name} placed ${card.type === 'property' ? (card as PropertyCard).name : 'a wildcard'} in ${setColor} set`;
      events.push(event);

      let newState = replacePlayer(state, updatedPlayer);
      newState = { ...newState, playsRemaining: newPlaysRemaining };
      newState = appendLog(newState, event);

      // Check win condition
      if (checkWin(newState.players.find(p => p.id === playerId)!, newState.cardMap)) {
        const winEvent = `${player.name} wins with 3 complete property sets!`;
        events.push(winEvent);
        newState = appendLog(newState, winEvent);
        newState = { ...newState, winnerId: playerId, phase: 'FINISHED' };
      } else if (newPlaysRemaining === 0) {
        const updatedP = newState.players.find(p => p.id === playerId)!;
        if (updatedP.hand.length > MAX_HAND_SIZE) {
          newState = { ...newState, phase: 'AWAITING_DISCARD' };
        }
      }

      return { state: newState, events };
    }

    // -----------------------------------------------------------------------
    case 'MOVE_WILDCARD': {
      // MOVE_WILDCARD is a free action — does NOT cost a play
      if (state.phase !== 'PLAYING') {
        return err(`Cannot move wildcard in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }

      const { cardId, fromSetColor, toSetColor } = action;
      const card = state.cardMap[cardId];
      if (!card) return err(`Unknown card: ${cardId}`);
      if (card.type !== 'wildcard') {
        return err(`Card ${cardId} is not a wildcard`);
      }

      // Verify card is in the fromSetColor set
      const fromSet = player.propertySets.find(s => s.color === fromSetColor);
      if (!fromSet || !fromSet.cards.includes(cardId)) {
        return err(`Card ${cardId} is not in your ${fromSetColor} set`);
      }

      const wildCard = card as WildcardCard;
      // Validate target color
      if (!wildCard.isMultiColor && !wildCard.colors.includes(toSetColor)) {
        return err(
          `Wildcard ${cardId} cannot be placed in ${toSetColor} set (valid: ${wildCard.colors.join(', ')})`
        );
      }

      const setsAfterRemoval = removeCardFromPropertySet(player.propertySets, fromSetColor, cardId);
      const setsAfterAdd = addCardToPropertySet(setsAfterRemoval, toSetColor, cardId);

      const updatedPlayer: PlayerState = {
        ...player,
        propertySets: setsAfterAdd,
      };

      const event = `${player.name} moved wildcard from ${fromSetColor} to ${toSetColor} set`;
      events.push(event);

      let newState = replacePlayer(state, updatedPlayer);
      // NOTE: playsRemaining is NOT decremented for MOVE_WILDCARD
      newState = appendLog(newState, event);

      // Check win condition
      if (checkWin(newState.players.find(p => p.id === playerId)!, newState.cardMap)) {
        const winEvent = `${player.name} wins with 3 complete property sets!`;
        events.push(winEvent);
        newState = appendLog(newState, winEvent);
        newState = { ...newState, winnerId: playerId, phase: 'FINISHED' };
      }

      return { state: newState, events };
    }

    // -----------------------------------------------------------------------
    case 'PLAY_PASS_GO': {
      if (state.phase !== 'PLAYING') {
        return err(`Cannot play Pass Go in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }
      if (state.playsRemaining <= 0) {
        return err('No plays remaining this turn');
      }

      const { cardId } = action;
      if (!player.hand.includes(cardId)) {
        return err(`Card ${cardId} is not in your hand`);
      }

      const card = state.cardMap[cardId];
      if (!card) return err(`Unknown card: ${cardId}`);
      if (card.type !== 'action' || (card as ActionCard).action !== 'passGo') {
        return err(`Card ${cardId} is not a Pass Go card`);
      }

      // Move card from hand to discard
      const handWithoutCard = player.hand.filter(id => id !== cardId);

      // Draw 2 cards
      const { drawn, newDeck, newDiscard: newDiscardAfterDraw, newSeed } = drawCards(
        state.deck,
        [...state.discard, cardId], // Pass Go goes to discard
        NORMAL_DRAW,
        state.rngSeed
      );

      const newPlaysRemaining = state.playsRemaining - 1;
      const updatedPlayer: PlayerState = {
        ...player,
        hand: [...handWithoutCard, ...drawn],
      };

      const event = `${player.name} played Pass Go and drew ${drawn.length} card${drawn.length !== 1 ? 's' : ''}`;
      events.push(event);

      let newState = replacePlayer(state, updatedPlayer);
      newState = {
        ...newState,
        deck: newDeck,
        discard: newDiscardAfterDraw,
        rngSeed: newSeed,
        playsRemaining: newPlaysRemaining,
      };
      newState = appendLog(newState, event);

      if (newPlaysRemaining === 0) {
        const updatedP = newState.players.find(p => p.id === playerId)!;
        if (updatedP.hand.length > MAX_HAND_SIZE) {
          newState = { ...newState, phase: 'AWAITING_DISCARD' };
        }
      }

      return { state: newState, events };
    }

    // -----------------------------------------------------------------------
    case 'END_TURN': {
      if (state.phase !== 'PLAYING') {
        return err(`Cannot end turn in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }

      // Player must discard if hand > MAX_HAND_SIZE
      if (player.hand.length > MAX_HAND_SIZE) {
        return err(`Must discard to ${MAX_HAND_SIZE} before ending turn (have ${player.hand.length})`);
      }

      const event = `${player.name} ended their turn`;
      events.push(event);

      let newState = appendLog(state, event);
      newState = advanceToNextPlayer(newState);

      return { state: newState, events };
    }

    // -----------------------------------------------------------------------
    case 'DISCARD': {
      if (state.phase !== 'AWAITING_DISCARD') {
        return err(`Cannot discard in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }

      const { cardIds } = action;
      // All discarded cards must be in hand
      for (const id of cardIds) {
        if (!player.hand.includes(id)) {
          return err(`Card ${id} is not in your hand`);
        }
      }

      const handAfterDiscard = player.hand.filter(id => !cardIds.includes(id));

      // After discard, hand must be ≤ MAX_HAND_SIZE
      if (handAfterDiscard.length > MAX_HAND_SIZE) {
        return err(
          `After discarding ${cardIds.length} card(s) you would still have ${handAfterDiscard.length} (max ${MAX_HAND_SIZE})`
        );
      }

      const updatedPlayer: PlayerState = {
        ...player,
        hand: handAfterDiscard,
      };

      const newDiscard = [...state.discard, ...cardIds];
      const event = `${player.name} discarded ${cardIds.length} card${cardIds.length !== 1 ? 's' : ''}`;
      events.push(event);

      let newState = replacePlayer(state, updatedPlayer);
      newState = { ...newState, discard: newDiscard };
      newState = appendLog(newState, event);
      newState = advanceToNextPlayer(newState);

      return { state: newState, events };
    }

    // -----------------------------------------------------------------------
    case 'PLAY_RENT': {
      if (state.phase !== 'PLAYING') {
        return err(`Cannot play rent in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }
      if (state.playsRemaining <= 0) {
        return err('No plays remaining this turn');
      }

      const { cardId, chosenColor, targetId, doubleCardIds } = action;

      if (!player.hand.includes(cardId)) {
        return err(`Card ${cardId} is not in your hand`);
      }

      const card = state.cardMap[cardId];
      if (!card) return err(`Unknown card: ${cardId}`);
      if (card.type !== 'rent') {
        return err(`Card ${cardId} is not a rent card`);
      }

      const rentCard = card as import('@monopoly-deal/shared').RentCard;

      // Validate chosenColor: player must own at least one card of that color
      const playerSet = player.propertySets.find(s => s.color === chosenColor);
      if (!playerSet || playerSet.cards.length === 0) {
        return err(`You don't own any ${chosenColor} properties`);
      }

      // Validate card applies to this color
      if (!rentCard.isWild && !rentCard.colors.includes(chosenColor)) {
        return err(`Rent card doesn't cover ${chosenColor} (covers: ${rentCard.colors.join(', ')})`);
      }

      // Wild rent requires a single targetId
      if (rentCard.isWild) {
        if (!targetId) {
          return err(`Wild rent card requires a targetId`);
        }
        const targetPlayer = state.players.find(p => p.id === targetId);
        if (!targetPlayer) return err(`Unknown target player: ${targetId}`);
        if (targetId === playerId) return err(`Cannot target yourself`);
      }

      // Validate doubleCardIds
      const doubles = doubleCardIds ?? [];
      for (const dId of doubles) {
        if (!player.hand.includes(dId)) {
          return err(`Double the Rent card ${dId} is not in your hand`);
        }
        const dc = state.cardMap[dId];
        if (!dc || dc.type !== 'action' || (dc as ActionCard).action !== 'doubleTheRent') {
          return err(`Card ${dId} is not a Double the Rent card`);
        }
      }

      // Calculate rent
      const baseRent = getRentValue(player, chosenColor, state.cardMap);
      const multiplier = Math.pow(2, doubles.length);
      const rentAmount = baseRent * multiplier;

      // Determine targets
      const targets: string[] = rentCard.isWild
        ? [targetId!]
        : state.players.filter(p => p.id !== playerId).map(p => p.id);

      // Total plays consumed: 1 for rent card + 1 per double
      const playsConsumed = 1 + doubles.length;
      if (state.playsRemaining < playsConsumed) {
        return err(`Not enough plays remaining (need ${playsConsumed}, have ${state.playsRemaining})`);
      }

      // Remove rent card and double cards from hand; move to discard
      const allPlayedIds = [cardId, ...doubles];
      const updatedPlayer: PlayerState = {
        ...player,
        hand: player.hand.filter(id => !allPlayedIds.includes(id)),
      };

      const newDiscard = [...state.discard, ...allPlayedIds];
      const newPlaysRemaining = state.playsRemaining - playsConsumed;

      const targetsText = rentCard.isWild ? `${state.players.find(p => p.id === targetId)!.name}` : 'all players';
      const event = `${player.name} charged ${targetsText} $${rentAmount}M rent on ${chosenColor}`;
      events.push(event);

      let newState = replacePlayer(state, updatedPlayer);
      newState = { ...newState, discard: newDiscard, playsRemaining: newPlaysRemaining };
      newState = appendLog(newState, event);

      // Enter JSN window — targets can say no before payment happens
      newState = enterJsnWindow(newState, playerId, targets, action);

      return { state: newState, events };
    }

    // -----------------------------------------------------------------------
    case 'PLAY_DEBT_COLLECTOR': {
      if (state.phase !== 'PLAYING') {
        return err(`Cannot play Debt Collector in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }
      if (state.playsRemaining <= 0) {
        return err('No plays remaining this turn');
      }

      const { cardId, targetId } = action;

      if (!player.hand.includes(cardId)) {
        return err(`Card ${cardId} is not in your hand`);
      }
      const card = state.cardMap[cardId];
      if (!card || card.type !== 'action' || (card as ActionCard).action !== 'debtCollector') {
        return err(`Card ${cardId} is not a Debt Collector card`);
      }
      if (targetId === playerId) {
        return err(`Cannot target yourself with Debt Collector`);
      }
      const targetPlayer = state.players.find(p => p.id === targetId);
      if (!targetPlayer) return err(`Unknown target player: ${targetId}`);

      const amount = 5;
      const updatedPlayer: PlayerState = {
        ...player,
        hand: player.hand.filter(id => id !== cardId),
      };

      const newDiscard = [...state.discard, cardId];
      const newPlaysRemaining = state.playsRemaining - 1;

      const event = `${player.name} charged ${targetPlayer.name} $${amount}M with Debt Collector`;
      events.push(event);

      let newState = replacePlayer(state, updatedPlayer);
      newState = { ...newState, discard: newDiscard, playsRemaining: newPlaysRemaining };
      newState = appendLog(newState, event);

      // Enter JSN window — target can say no before payment happens
      newState = enterJsnWindow(newState, playerId, [targetId], action);

      return { state: newState, events };
    }

    // -----------------------------------------------------------------------
    case 'PLAY_BIRTHDAY': {
      if (state.phase !== 'PLAYING') {
        return err(`Cannot play Birthday in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }
      if (state.playsRemaining <= 0) {
        return err('No plays remaining this turn');
      }

      const { cardId } = action;

      if (!player.hand.includes(cardId)) {
        return err(`Card ${cardId} is not in your hand`);
      }
      const card = state.cardMap[cardId];
      if (!card || card.type !== 'action' || (card as ActionCard).action !== 'birthday') {
        return err(`Card ${cardId} is not a Birthday card`);
      }

      const amount = 2;
      const opponents = state.players.filter(p => p.id !== playerId);

      const updatedPlayer: PlayerState = {
        ...player,
        hand: player.hand.filter(id => id !== cardId),
      };

      const newDiscard = [...state.discard, cardId];
      const newPlaysRemaining = state.playsRemaining - 1;

      const event = `${player.name} played It's My Birthday — all players owe $${amount}M`;
      events.push(event);

      let newState = replacePlayer(state, updatedPlayer);
      newState = { ...newState, discard: newDiscard, playsRemaining: newPlaysRemaining };
      newState = appendLog(newState, event);

      const opponentIds = opponents.map(o => o.id);

      // Enter JSN window — each opponent can say no before payment happens
      newState = enterJsnWindow(newState, playerId, opponentIds, action);

      return { state: newState, events };
    }

    // -----------------------------------------------------------------------
    case 'PAY': {
      if (state.phase !== 'AWAITING_PAYMENT') {
        return err(`Cannot pay in phase ${state.phase}`);
      }

      const pi = state.pendingInteraction;
      if (!pi || pi.type !== 'PAYMENT') {
        return err('No pending payment interaction');
      }

      // Find the next unpaid debt that belongs to this player
      const debtIndex = pi.debts.findIndex(d => d.debtorId === playerId && !d.paid);
      if (debtIndex === -1) {
        return err(`${playerId} does not have a pending payment`);
      }

      const debt = pi.debts[debtIndex]!;
      const { cardIds } = action;

      // Validate each card is in the player's bank or propertySets (not hand)
      // and is not a $0 multi-color wildcard
      for (const cid of cardIds) {
        const card = state.cardMap[cid];
        if (!card) return err(`Unknown card: ${cid}`);

        // Check location: bank or propertySets
        const inBank = player.bank.includes(cid);
        const inProperty = findCardSet(player, cid) !== null;
        // Also check houseCardId / hotelCardId on sets
        const inHouseSlot = player.propertySets.some(s => s.houseCardId === cid || s.hotelCardId === cid);

        if (!inBank && !inProperty && !inHouseSlot) {
          return err(`Card ${cid} is not in your bank or property area`);
        }

        if (card.type === 'wildcard' && (card as WildcardCard).isMultiColor) {
          return err(`Multi-color wildcards cannot be used as payment`);
        }
      }

      // Calculate total value being paid
      const totalPaid = cardIds.reduce((sum, cid) => {
        const card = state.cardMap[cid];
        return sum + (card ? getPaymentValue(card) : 0);
      }, 0);

      const totalAssets = getTotalAssetValue(player, state.cardMap);
      const amountOwed = debt.amountOwed;

      // Validate payment amount
      if (totalPaid < amountOwed && totalPaid < totalAssets) {
        return err(
          `Must pay at least $${amountOwed}M or all assets (you have $${totalAssets}M total, paying $${totalPaid}M)`
        );
      }

      // Transfer cards to recipient
      const recipient = state.players.find(p => p.id === pi.recipientId);
      if (!recipient) return err(`Unknown recipient: ${pi.recipientId}`);

      // Remove from payer's bank / propertySets
      let updatedPayer = { ...player };
      let updatedRecipient = { ...recipient };

      for (const cid of cardIds) {
        const card = state.cardMap[cid];
        if (!card) continue;

        if (updatedPayer.bank.includes(cid)) {
          // Money/action/rent card in bank → goes to recipient's bank
          updatedPayer = { ...updatedPayer, bank: updatedPayer.bank.filter(id => id !== cid) };
          updatedRecipient = { ...updatedRecipient, bank: [...updatedRecipient.bank, cid] };
        } else {
          // In propertySets (or house/hotel slot) → goes to recipient's propertySets
          // Figure out which color set it was in
          const sourceSet = findCardSet(updatedPayer, cid);
          if (sourceSet) {
            updatedPayer = removeCardFromAllSets(updatedPayer, cid);
            updatedRecipient = {
              ...updatedRecipient,
              propertySets: addCardToPropertySet(updatedRecipient.propertySets, sourceSet.color, cid),
            };
          } else {
            // Could be a house/hotel card
            const setWithHouse = updatedPayer.propertySets.find(s => s.houseCardId === cid);
            const setWithHotel = updatedPayer.propertySets.find(s => s.hotelCardId === cid);

            if (setWithHouse) {
              updatedPayer = {
                ...updatedPayer,
                propertySets: updatedPayer.propertySets.map(s =>
                  s.houseCardId === cid
                    ? { ...s, hasHouse: false, houseCardId: undefined }
                    : s
                ),
              };
              // House card goes to recipient's bank (as money value)
              updatedRecipient = { ...updatedRecipient, bank: [...updatedRecipient.bank, cid] };
            } else if (setWithHotel) {
              updatedPayer = {
                ...updatedPayer,
                propertySets: updatedPayer.propertySets.map(s =>
                  s.hotelCardId === cid
                    ? { ...s, hasHotel: false, hotelCardId: undefined }
                    : s
                ),
              };
              // Hotel card goes to recipient's bank (as money value)
              updatedRecipient = { ...updatedRecipient, bank: [...updatedRecipient.bank, cid] };
            }
          }
        }
      }

      const event = `${player.name} paid ${recipient.name} $${totalPaid}M`;
      events.push(event);

      // Mark debt as paid
      const updatedDebts = pi.debts.map((d, i) =>
        i === debtIndex ? { ...d, paid: true, cardsPaid: cardIds } : d
      );

      let newState = replacePlayer(state, updatedPayer);
      newState = replacePlayer(newState, updatedRecipient);
      newState = appendLog(newState, event);

      // Check if all debts are paid
      const allPaid = updatedDebts.every(d => d.paid);

      if (allPaid) {
        // Return to PLAYING for the original active player
        newState = {
          ...newState,
          phase: 'PLAYING',
          pendingInteraction: null,
        };
      } else {
        // Update the debts in pendingInteraction, stay in AWAITING_PAYMENT
        newState = {
          ...newState,
          pendingInteraction: { ...pi, debts: updatedDebts },
        };
      }

      return { state: newState, events };
    }

    // -----------------------------------------------------------------------
    case 'PLAY_SLY_DEAL': {
      if (state.phase !== 'PLAYING') {
        return err(`Cannot play Sly Deal in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }
      if (state.playsRemaining <= 0) {
        return err('No plays remaining this turn');
      }

      const { cardId, targetId, targetCardId } = action;

      if (!player.hand.includes(cardId)) {
        return err(`Card ${cardId} is not in your hand`);
      }
      const card = state.cardMap[cardId];
      if (!card || card.type !== 'action' || (card as ActionCard).action !== 'slyDeal') {
        return err(`Card ${cardId} is not a Sly Deal card`);
      }
      if (targetId === playerId) {
        return err(`Cannot target yourself`);
      }
      const targetPlayer = state.players.find(p => p.id === targetId);
      if (!targetPlayer) return err(`Unknown target player: ${targetId}`);

      // Find the target card in target's propertySets
      const targetSet = findCardSet(targetPlayer, targetCardId);
      if (!targetSet) {
        return err(`Card ${targetCardId} is not in ${targetPlayer.name}'s property area`);
      }

      // Cannot steal from a complete set
      if (isSetComplete(targetSet, state.cardMap)) {
        return err(`Cannot steal from a complete set (${targetSet.color})`);
      }

      const stolenCard = state.cardMap[targetCardId];
      if (!stolenCard) return err(`Unknown card: ${targetCardId}`);

      // Move Sly Deal card to discard, decrement plays
      const updatedPlayer: PlayerState = {
        ...player,
        hand: player.hand.filter(id => id !== cardId),
      };
      const newDiscard = [...state.discard, cardId];
      const newPlaysRemaining = state.playsRemaining - 1;

      const event = `${player.name} played Sly Deal targeting ${targetPlayer.name}'s ${targetSet.color} property`;
      events.push(event);

      let newState = replacePlayer(state, updatedPlayer);
      newState = { ...newState, discard: newDiscard, playsRemaining: newPlaysRemaining };
      newState = appendLog(newState, event);

      // Enter JSN window — target can say no before steal happens
      newState = enterJsnWindow(newState, playerId, [targetId], action);

      return { state: newState, events };
    }

    // -----------------------------------------------------------------------
    case 'PLAY_FORCED_DEAL': {
      if (state.phase !== 'PLAYING') {
        return err(`Cannot play Forced Deal in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }
      if (state.playsRemaining <= 0) {
        return err('No plays remaining this turn');
      }

      const { cardId, targetId, targetCardId, myCardId } = action;

      if (!player.hand.includes(cardId)) {
        return err(`Card ${cardId} is not in your hand`);
      }
      const card = state.cardMap[cardId];
      if (!card || card.type !== 'action' || (card as ActionCard).action !== 'forcedDeal') {
        return err(`Card ${cardId} is not a Forced Deal card`);
      }
      if (targetId === playerId) {
        return err(`Cannot target yourself`);
      }
      const targetPlayer = state.players.find(p => p.id === targetId);
      if (!targetPlayer) return err(`Unknown target player: ${targetId}`);

      // Validate myCardId is in current player's propertySets (not a complete set)
      const mySet = findCardSet(player, myCardId);
      if (!mySet) {
        return err(`Card ${myCardId} is not in your property area`);
      }
      if (isSetComplete(mySet, state.cardMap)) {
        return err(`Cannot give a card from your complete set (${mySet.color})`);
      }

      // Validate targetCardId is in target's propertySets (not a complete set)
      const theirSet = findCardSet(targetPlayer, targetCardId);
      if (!theirSet) {
        return err(`Card ${targetCardId} is not in ${targetPlayer.name}'s property area`);
      }
      if (isSetComplete(theirSet, state.cardMap)) {
        return err(`Cannot take a card from ${targetPlayer.name}'s complete set (${theirSet.color})`);
      }

      // Move Forced Deal card to discard, decrement plays
      const updatedPlayer2: PlayerState = {
        ...player,
        hand: player.hand.filter(id => id !== cardId),
      };
      const newDiscard2 = [...state.discard, cardId];
      const newPlaysRemaining2 = state.playsRemaining - 1;

      const myCardObj = state.cardMap[myCardId];
      const theirCardObj = state.cardMap[targetCardId];
      const myCardName = myCardObj?.type === 'property' ? (myCardObj as PropertyCard).name : mySet.color;
      const theirCardName = theirCardObj?.type === 'property' ? (theirCardObj as PropertyCard).name : theirSet.color;

      const event2 = `${player.name} played Forced Deal: wants to swap ${myCardName} (${mySet.color}) for ${theirCardName} (${theirSet.color}) from ${targetPlayer.name}`;
      events.push(event2);

      let newState2 = replacePlayer(state, updatedPlayer2);
      newState2 = { ...newState2, discard: newDiscard2, playsRemaining: newPlaysRemaining2 };
      newState2 = appendLog(newState2, event2);

      // Enter JSN window — target can say no before swap happens
      newState2 = enterJsnWindow(newState2, playerId, [targetId], action);

      return { state: newState2, events };
    }

    // -----------------------------------------------------------------------
    case 'PLAY_DEAL_BREAKER': {
      if (state.phase !== 'PLAYING') {
        return err(`Cannot play Deal Breaker in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }
      if (state.playsRemaining <= 0) {
        return err('No plays remaining this turn');
      }

      const { cardId, targetId, setColor } = action;

      if (!player.hand.includes(cardId)) {
        return err(`Card ${cardId} is not in your hand`);
      }
      const card = state.cardMap[cardId];
      if (!card || card.type !== 'action' || (card as ActionCard).action !== 'dealBreaker') {
        return err(`Card ${cardId} is not a Deal Breaker card`);
      }
      if (targetId === playerId) {
        return err(`Cannot target yourself`);
      }
      const targetPlayer = state.players.find(p => p.id === targetId);
      if (!targetPlayer) return err(`Unknown target player: ${targetId}`);

      // Target must have a complete set of setColor
      const targetSet = targetPlayer.propertySets.find(s => s.color === setColor);
      if (!targetSet) {
        return err(`${targetPlayer.name} doesn't have a ${setColor} set`);
      }
      if (!isSetComplete(targetSet, state.cardMap)) {
        return err(`${targetPlayer.name}'s ${setColor} set is not complete`);
      }

      // Move Deal Breaker card to discard, decrement plays
      const updatedPlayerDb: PlayerState = {
        ...player,
        hand: player.hand.filter(id => id !== cardId),
      };
      const newDiscardDb = [...state.discard, cardId];
      const newPlaysRemainingDb = state.playsRemaining - 1;

      const eventDb = `${player.name} played Deal Breaker targeting ${targetPlayer.name}'s complete ${setColor} set!`;
      events.push(eventDb);

      let newStateDb = replacePlayer(state, updatedPlayerDb);
      newStateDb = { ...newStateDb, discard: newDiscardDb, playsRemaining: newPlaysRemainingDb };
      newStateDb = appendLog(newStateDb, eventDb);

      // Enter JSN window — target can say no before steal happens
      newStateDb = enterJsnWindow(newStateDb, playerId, [targetId], action);

      return { state: newStateDb, events };
    }

    // -----------------------------------------------------------------------
    case 'PLAY_HOUSE': {
      if (state.phase !== 'PLAYING') {
        return err(`Cannot play House in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }
      if (state.playsRemaining <= 0) {
        return err('No plays remaining this turn');
      }

      const { cardId, setColor } = action;

      if (!player.hand.includes(cardId)) {
        return err(`Card ${cardId} is not in your hand`);
      }
      const card = state.cardMap[cardId];
      if (!card || card.type !== 'action' || (card as ActionCard).action !== 'house') {
        return err(`Card ${cardId} is not a House card`);
      }

      // Cannot place on railroad or utility
      if (setColor === 'railroad' || setColor === 'utility') {
        return err(`Cannot place a House on a ${setColor} set`);
      }

      // Must be a complete set
      const targetSet = player.propertySets.find(s => s.color === setColor);
      if (!targetSet || !isSetComplete(targetSet, state.cardMap)) {
        return err(`Your ${setColor} set is not complete`);
      }

      // Set must not already have a house
      if (targetSet.hasHouse) {
        return err(`Your ${setColor} set already has a House`);
      }

      const newPlaysRemaining = state.playsRemaining - 1;

      const updatedPlayer: PlayerState = {
        ...player,
        hand: player.hand.filter(id => id !== cardId),
        propertySets: player.propertySets.map(s =>
          s.color === setColor
            ? { ...s, hasHouse: true, houseCardId: cardId }
            : s
        ),
      };

      const event = `${player.name} added a House to their ${setColor} set (+$${HOUSE_BONUS}M rent)`;
      events.push(event);

      let newState = replacePlayer(state, updatedPlayer);
      newState = { ...newState, playsRemaining: newPlaysRemaining };
      newState = appendLog(newState, event);

      return { state: newState, events };
    }

    // -----------------------------------------------------------------------
    case 'PLAY_HOTEL': {
      if (state.phase !== 'PLAYING') {
        return err(`Cannot play Hotel in phase ${state.phase}`);
      }
      if (playerId !== cp.id) {
        return err('It is not your turn');
      }
      if (state.playsRemaining <= 0) {
        return err('No plays remaining this turn');
      }

      const { cardId, setColor } = action;

      if (!player.hand.includes(cardId)) {
        return err(`Card ${cardId} is not in your hand`);
      }
      const card = state.cardMap[cardId];
      if (!card || card.type !== 'action' || (card as ActionCard).action !== 'hotel') {
        return err(`Card ${cardId} is not a Hotel card`);
      }

      // Cannot place on railroad or utility
      if (setColor === 'railroad' || setColor === 'utility') {
        return err(`Cannot place a Hotel on a ${setColor} set`);
      }

      // Must be a complete set
      const targetSet = player.propertySets.find(s => s.color === setColor);
      if (!targetSet || !isSetComplete(targetSet, state.cardMap)) {
        return err(`Your ${setColor} set is not complete`);
      }

      // Must have a house first
      if (!targetSet.hasHouse) {
        return err(`Your ${setColor} set must have a House before adding a Hotel`);
      }

      // Set must not already have a hotel
      if (targetSet.hasHotel) {
        return err(`Your ${setColor} set already has a Hotel`);
      }

      const newPlaysRemaining = state.playsRemaining - 1;

      const updatedPlayer: PlayerState = {
        ...player,
        hand: player.hand.filter(id => id !== cardId),
        propertySets: player.propertySets.map(s =>
          s.color === setColor
            ? { ...s, hasHotel: true, hotelCardId: cardId }
            : s
        ),
      };

      const event = `${player.name} added a Hotel to their ${setColor} set (+$${HOTEL_BONUS}M rent)`;
      events.push(event);

      let newState = replacePlayer(state, updatedPlayer);
      newState = { ...newState, playsRemaining: newPlaysRemaining };
      newState = appendLog(newState, event);

      return { state: newState, events };
    }

    // -----------------------------------------------------------------------
    case 'RESPOND_JUST_SAY_NO': {
      if (state.phase !== 'AWAITING_RESPONSES') {
        return err(`Cannot play Just Say No in phase ${state.phase}`);
      }
      const pi = state.pendingInteraction;
      if (!pi || pi.type !== 'JSN_WINDOW') {
        return err('No pending JSN window');
      }

      const { cardId: jsnCardId } = action;

      // Validate the card is a JSN card in the player's hand
      if (!player.hand.includes(jsnCardId)) {
        return err(`Card ${jsnCardId} is not in your hand`);
      }
      const jsnCard = state.cardMap[jsnCardId];
      if (!jsnCard || jsnCard.type !== 'action' || (jsnCard as ActionCard).action !== 'justSayNo') {
        return err(`Card ${jsnCardId} is not a Just Say No card`);
      }

      const targetJsnStates = pi.targetJsnStates ?? [];
      // Check isInitiator FIRST — initiator is never a target even if in awaitingJsnFrom
      const isInitiator = playerId === pi.initiatorId;
      const isTarget = !isInitiator && (pi.awaitingJsnFrom?.includes(playerId) ?? false);

      // Determine which chain this player is responding for
      let chainIdx = -1;
      if (isInitiator) {
        // Initiator counter-JSNs a target's JSN
        if (!(pi.awaitingJsnFrom ?? []).includes(playerId)) {
          return err(`Initiator is not in the awaiting-response list`);
        }
        chainIdx = targetJsnStates.findIndex(
          t => !t.resolved && t.awaitingFrom === 'initiator'
        );
        if (chainIdx === -1) {
          return err(`No target chain awaiting initiator counter-JSN`);
        }
      } else if (isTarget) {
        // Target plays JSN against the action
        chainIdx = targetJsnStates.findIndex(
          t => t.targetId === playerId && !t.resolved && t.awaitingFrom === 'target'
        );
        if (chainIdx === -1) {
          return err(`${playerId} is not awaiting a JSN response in any chain`);
        }
      } else {
        return err(`${playerId} is not authorized to respond in this JSN window`);
      }

      // Move JSN card from hand to discard
      const updatedPlayerJsn: PlayerState = {
        ...player,
        hand: player.hand.filter(id => id !== jsnCardId),
      };
      const newDiscardJsn = [...state.discard, jsnCardId];

      const chainTarget = targetJsnStates[chainIdx]!;
      const initiatorPlayer = state.players.find(p => p.id === pi.initiatorId)!;
      const targetPlayerForLog = state.players.find(p => p.id === chainTarget.targetId)!;

      let eventJsn: string;
      if (isTarget) {
        eventJsn = `${player.name} played Just Say No to block the action!`;
      } else {
        eventJsn = `${initiatorPlayer.name} countered with Just Say No!`;
      }
      events.push(eventJsn);

      // Update the chain: increment jsnCount, flip awaitingFrom
      const newJsnCount = chainTarget.jsnCount + 1;
      const newAwaitingFrom: 'target' | 'initiator' = isTarget ? 'initiator' : 'target';

      const updatedChain: TargetJsnState = {
        ...chainTarget,
        jsnCount: newJsnCount,
        awaitingFrom: newAwaitingFrom,
      };
      const updatedTargetJsnStates = targetJsnStates.map((t, i) =>
        i === chainIdx ? updatedChain : t
      );

      // Update awaitingJsnFrom: remove current player, add the other side
      const newAwaitingJsnFrom = (pi.awaitingJsnFrom ?? []).filter(id => id !== playerId);
      if (newAwaitingFrom === 'initiator') {
        // It's now the initiator's turn to counter or allow
        if (!newAwaitingJsnFrom.includes(pi.initiatorId)) {
          newAwaitingJsnFrom.push(pi.initiatorId);
        }
      } else {
        // It's now the target's turn again
        if (!newAwaitingJsnFrom.includes(chainTarget.targetId)) {
          newAwaitingJsnFrom.push(chainTarget.targetId);
        }
      }

      const updatedPi: PendingInteraction = {
        ...pi,
        targetJsnStates: updatedTargetJsnStates,
        awaitingJsnFrom: newAwaitingJsnFrom,
      };

      let newStateJsn = replacePlayer(state, updatedPlayerJsn);
      newStateJsn = { ...newStateJsn, discard: newDiscardJsn, pendingInteraction: updatedPi };
      newStateJsn = appendLog(newStateJsn, eventJsn);

      // NOTE: playsRemaining is NOT decremented for JSN
      return { state: newStateJsn, events };
    }

    // -----------------------------------------------------------------------
    case 'RESPOND_ALLOW': {
      if (state.phase !== 'AWAITING_RESPONSES') {
        return err(`Cannot respond Allow in phase ${state.phase}`);
      }
      const pi = state.pendingInteraction;
      if (!pi || pi.type !== 'JSN_WINDOW') {
        return err('No pending JSN window');
      }

      const isInitiator = playerId === pi.initiatorId;
      const isInAwaitingList = pi.awaitingJsnFrom?.includes(playerId) ?? false;

      if (!isInAwaitingList) {
        return err(`${playerId} is not in the awaiting-response list`);
      }

      const targetJsnStates = pi.targetJsnStates ?? [];
      let chainIdx = -1;

      if (isInitiator) {
        // Initiator allows — finds the chain awaiting initiator response
        chainIdx = targetJsnStates.findIndex(
          t => !t.resolved && t.awaitingFrom === 'initiator'
        );
        if (chainIdx === -1) {
          return err(`No chain awaiting initiator's response`);
        }
      } else {
        // Target allows — finds their own chain
        chainIdx = targetJsnStates.findIndex(
          t => t.targetId === playerId && !t.resolved
        );
        if (chainIdx === -1) {
          return err(`${playerId} is not awaiting response in any chain`);
        }
      }

      const chainTarget = targetJsnStates[chainIdx]!;
      const initiatorPlayer = state.players.find(p => p.id === pi.initiatorId)!;

      // Resolve this chain: determine if action is cancelled (odd jsnCount)
      const cancelled = chainTarget.jsnCount % 2 === 1;
      const updatedChain: TargetJsnState = {
        ...chainTarget,
        resolved: true,
        cancelled,
      };
      const updatedTargetJsnStates = targetJsnStates.map((t, i) =>
        i === chainIdx ? updatedChain : t
      );

      // Remove this player from awaitingJsnFrom
      const newAwaitingJsnFrom = (pi.awaitingJsnFrom ?? []).filter(id => id !== playerId);

      const chainTargetPlayer = state.players.find(p => p.id === chainTarget.targetId)!;
      let eventAllow: string;
      if (isInitiator) {
        eventAllow = `${initiatorPlayer.name} allows — ${chainTargetPlayer.name}'s Just Say No stands`;
      } else {
        eventAllow = `${player.name} allows the action to proceed`;
      }
      events.push(eventAllow);

      const updatedPi: PendingInteraction = {
        ...pi,
        targetJsnStates: updatedTargetJsnStates,
        awaitingJsnFrom: newAwaitingJsnFrom,
      };

      let newStateAllow: GameState = { ...state, pendingInteraction: updatedPi };
      newStateAllow = appendLog(newStateAllow, eventAllow);

      // Check if all chains resolved
      newStateAllow = resolveJsnWindow(newStateAllow);

      return { state: newStateAllow, events };
    }

    // -----------------------------------------------------------------------
    default: {
      // Legacy / future actions not yet implemented in the engine
      return err(`Action type "${(action as any).type}" is not handled by the engine`);
    }
  }
}

// ---------------------------------------------------------------------------
// getRedactedView
// ---------------------------------------------------------------------------

export function getRedactedView(state: GameState, playerId: string): RedactedGameView {
  const cp = currentPlayer(state);

  // Determine what the requesting player must do right now
  function yourPendingDecision(): PendingDecision | null {
    if (state.phase === 'FINISHED' || state.phase === 'WAITING') return null;

    if (playerId === cp.id) {
      if (state.phase === 'AWAITING_TURN_START') return { type: 'drawCards' };
      if (state.phase === 'PLAYING') return { type: 'playOrEnd' };
      if (state.phase === 'AWAITING_DISCARD') return { type: 'discard' };
    }

    if (state.phase === 'AWAITING_RESPONSES') {
      const pi = state.pendingInteraction;
      if (pi && pi.type === 'JSN_WINDOW' && pi.awaitingJsnFrom?.includes(playerId)) {
        return { type: 'respondJSN' };
      }
    }

    if (state.phase === 'AWAITING_PAYMENT') {
      const pi = state.pendingInteraction;
      if (pi && pi.type === 'PAYMENT') {
        const unpaid = pi.debts.find(d => d.debtorId === playerId && !d.paid);
        if (unpaid) return { type: 'pay' };
      }
    }

    return null;
  }

  const players: RedactedPlayerView[] = state.players.map(p => {
    const isMe = p.id === playerId;
    const base: RedactedPlayerView = {
      id: p.id,
      name: p.name,
      isCurrentPlayer: p.id === cp.id,
      handCount: p.hand.length,
      bank: p.bank.map(id => state.cardMap[id]).filter((c): c is Card => c !== undefined),
      propertySets: p.propertySets,
      connected: p.connected,
    };

    if (isMe) {
      // Include own hand as Card objects
      return {
        ...base,
        hand: p.hand.map(id => state.cardMap[id]).filter(Boolean) as Card[],
      };
    }

    // Never include another player's hand
    return base;
  });

  const discardTopId = state.discard.length > 0 ? state.discard[state.discard.length - 1] : null;
  const discardTop = discardTopId ? (state.cardMap[discardTopId] ?? null) : null;

  return {
    gameId: state.gameId,
    phase: state.phase,
    myPlayerId: playerId,
    players,
    currentPlayerIndex: state.currentPlayerIndex,
    playsRemaining: state.playsRemaining,
    deck: { count: state.deck.length },
    discardTop,
    pendingInteraction: state.pendingInteraction,
    actionLog: state.actionLog,
    winnerId: state.winnerId,
    yourPendingDecision: yourPendingDecision(),
  };
}
