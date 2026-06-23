import { describe, it, expect } from 'vitest';
import {
  buildDeck,
  type Card,
  type MoneyCard,
  type PropertyCard,
  type WildcardCard,
  type RentCard,
  type ActionCard,
  type Color,
} from '@monopoly-deal/shared';
import { SET_SIZES, RENT_LADDERS, HOUSE_BONUS, HOTEL_BONUS } from '@monopoly-deal/shared';
import type { PropertySet, PlayerState, GameState } from '@monopoly-deal/shared';
import { createGame, applyAction, getRedactedView } from './engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function money(deck: Card[]): MoneyCard[] {
  return deck.filter((c): c is MoneyCard => c.type === 'money');
}

function properties(deck: Card[]): PropertyCard[] {
  return deck.filter((c): c is PropertyCard => c.type === 'property');
}

function wildcards(deck: Card[]): WildcardCard[] {
  return deck.filter((c): c is WildcardCard => c.type === 'wildcard');
}

function rents(deck: Card[]): RentCard[] {
  return deck.filter((c): c is RentCard => c.type === 'rent');
}

function actions(deck: Card[]): ActionCard[] {
  return deck.filter((c): c is ActionCard => c.type === 'action');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildDeck()', () => {
  const deck = buildDeck();

  // 1. Total size
  it('returns exactly 106 cards', () => {
    expect(deck).toHaveLength(106);
  });

  // 2. Per-type counts
  it('contains 20 money cards', () => {
    expect(money(deck)).toHaveLength(20);
  });

  it('contains 28 property cards', () => {
    expect(properties(deck)).toHaveLength(28);
  });

  it('contains 11 wildcard cards', () => {
    expect(wildcards(deck)).toHaveLength(11);
  });

  it('contains 13 rent cards', () => {
    expect(rents(deck)).toHaveLength(13);
  });

  it('contains 34 action cards', () => {
    expect(actions(deck)).toHaveLength(34);
  });

  // 3. Money total
  it('money cards sum to $57M', () => {
    const total = money(deck).reduce((sum, c) => sum + c.value, 0);
    expect(total).toBe(57);
  });

  // 4. Property counts per color
  const COLOR_COUNTS: Record<Color, number> = {
    brown: 2,
    lightBlue: 3,
    pink: 3,
    orange: 3,
    red: 3,
    yellow: 3,
    green: 3,
    darkBlue: 2,
    railroad: 4,
    utility: 2,
  };

  for (const [color, expected] of Object.entries(COLOR_COUNTS) as [Color, number][]) {
    it(`has ${expected} ${color} property card(s)`, () => {
      const count = properties(deck).filter(c => c.color === color).length;
      expect(count).toBe(expected);
    });
  }

  // 5. Multi-color wildcards
  it('has 2 multi-color wildcards with $0 bank value', () => {
    const multiColor = wildcards(deck).filter(c => c.isMultiColor);
    expect(multiColor).toHaveLength(2);
    for (const card of multiColor) {
      expect(card.bankValue).toBe(0);
    }
  });

  it('has 9 two-color (non-multi) wildcards', () => {
    const twoColor = wildcards(deck).filter(c => !c.isMultiColor);
    expect(twoColor).toHaveLength(9);
  });

  // 6. Action subtype counts
  const ACTION_COUNTS: Record<ActionCard['action'], number> = {
    dealBreaker: 2,
    justSayNo: 3,
    slyDeal: 3,
    forcedDeal: 3,
    debtCollector: 3,
    birthday: 3,
    doubleTheRent: 2,
    house: 3,
    hotel: 2,
    passGo: 10,
  };

  for (const [action, expected] of Object.entries(ACTION_COUNTS) as [ActionCard['action'], number][]) {
    it(`has ${expected} "${action}" action card(s)`, () => {
      const count = actions(deck).filter(c => c.action === action).length;
      expect(count).toBe(expected);
    });
  }

  // 7. Wild rent cards
  it('has 3 wild rent cards', () => {
    const wildRents = rents(deck).filter(c => c.isWild);
    expect(wildRents).toHaveLength(3);
  });

  it('has 10 standard (non-wild) rent cards', () => {
    const standardRents = rents(deck).filter(c => !c.isWild);
    expect(standardRents).toHaveLength(10);
  });

  // 8. All card IDs are unique
  it('all card IDs are unique', () => {
    const ids = deck.map(c => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  // 9. Money denomination counts
  it('has correct money denomination counts', () => {
    const denom = money(deck).reduce<Record<number, number>>((acc, c) => {
      acc[c.value] = (acc[c.value] ?? 0) + 1;
      return acc;
    }, {});
    expect(denom[10]).toBe(1);
    expect(denom[5]).toBe(2);
    expect(denom[4]).toBe(3);
    expect(denom[3]).toBe(3);
    expect(denom[2]).toBe(5);
    expect(denom[1]).toBe(6);
  });

  // 10. Rent cards per color pair
  it('has 2 dark-blue/green rent cards', () => {
    const count = rents(deck).filter(
      c => !c.isWild && c.colors.includes('darkBlue') && c.colors.includes('green')
    ).length;
    expect(count).toBe(2);
  });

  it('has 2 railroad/utility rent cards', () => {
    const count = rents(deck).filter(
      c => !c.isWild && c.colors.includes('railroad') && c.colors.includes('utility')
    ).length;
    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Engine core tests
// ---------------------------------------------------------------------------

describe('Engine core', () => {
  const SEED = 42;
  const TWO_PLAYERS = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ];

  // Helper: advance through START_TURN
  function startTurn(state: ReturnType<typeof createGame>, playerId: string) {
    return applyAction(state, playerId, { type: 'START_TURN' });
  }

  // Helper: find first card of type in a player's hand
  function findInHand(
    state: ReturnType<typeof createGame>,
    playerId: string,
    type: string,
    predicate?: (c: Card) => boolean
  ): string | undefined {
    const player = state.players.find(p => p.id === playerId)!;
    return player.hand.find(id => {
      const card = state.cardMap[id];
      return card?.type === type && (predicate ? predicate(card) : true);
    });
  }

  // 1. createGame creates valid initial state
  it('createGame creates valid initial state (2 players)', () => {
    const state = createGame(TWO_PLAYERS, SEED);
    expect(state.phase).toBe('AWAITING_TURN_START');
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.players).toHaveLength(2);
    expect(state.players[0].hand).toHaveLength(5);
    expect(state.players[1].hand).toHaveLength(5);
    // deck should have 106 - (5 * 2) = 96 cards
    expect(state.deck).toHaveLength(106 - 5 * 2);
    expect(state.winnerId).toBeNull();
    expect(state.pendingInteraction).toBeNull();
    expect(Object.keys(state.cardMap)).toHaveLength(106);
  });

  it('createGame creates valid initial state (3 players)', () => {
    const state = createGame(
      [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }],
      SEED
    );
    expect(state.deck).toHaveLength(106 - 5 * 3);
    state.players.forEach(p => expect(p.hand).toHaveLength(5));
  });

  // 2. START_TURN draws 2 cards normally
  it('START_TURN draws 2 cards when hand is not empty', () => {
    const initial = createGame(TWO_PLAYERS, SEED);
    const { state, error } = startTurn(initial, 'p1');
    expect(error).toBeUndefined();
    expect(state.phase).toBe('PLAYING');
    expect(state.players[0].hand).toHaveLength(5 + 2); // started with 5, drew 2
    expect(state.playsRemaining).toBe(3);
  });

  // 3. START_TURN draws 5 when hand is empty
  it('START_TURN draws 5 cards when hand is empty', () => {
    const initial = createGame(TWO_PLAYERS, SEED);
    // Manually empty p1's hand
    const stateWithEmptyHand = {
      ...initial,
      players: initial.players.map(p =>
        p.id === 'p1' ? { ...p, hand: [] } : p
      ),
    };
    const { state, error } = startTurn(stateWithEmptyHand, 'p1');
    expect(error).toBeUndefined();
    expect(state.players[0].hand).toHaveLength(5);
  });

  // 4. Deck reshuffles from discard when empty
  it('reshuffles discard into deck when deck runs out during draw', () => {
    const initial = createGame(TWO_PLAYERS, SEED);
    // Move nearly all deck cards to discard, leave only 1 in deck
    const { deck, discard } = initial;
    const newDeck = deck.slice(-1);           // keep 1 card
    const newDiscard = [...discard, ...deck.slice(0, deck.length - 1)]; // rest to discard

    const stateWithTinyDeck = {
      ...initial,
      deck: newDeck,
      discard: newDiscard,
    };

    // p1 needs to draw 2 but deck only has 1 → should reshuffle discard
    const { state, error } = startTurn(stateWithTinyDeck, 'p1');
    expect(error).toBeUndefined();
    // Player drew at least 1 card (may be fewer if reshuffle gives enough)
    expect(state.players[0].hand.length).toBeGreaterThanOrEqual(5 + 1);
  });

  // 5. PLAY_MONEY banks a money card
  it('PLAY_MONEY moves a money card from hand to bank', () => {
    const initial = createGame(TWO_PLAYERS, SEED);
    const { state: playing } = startTurn(initial, 'p1');

    const moneyCardId = findInHand(playing, 'p1', 'money');
    expect(moneyCardId).toBeDefined();

    const { state, error } = applyAction(playing, 'p1', {
      type: 'PLAY_MONEY',
      cardId: moneyCardId!,
    });

    expect(error).toBeUndefined();
    expect(state.players[0].bank).toContain(moneyCardId);
    expect(state.players[0].hand).not.toContain(moneyCardId);
    expect(state.playsRemaining).toBe(2);
  });

  // 6. PLAY_PROPERTY places property in correct set
  it('PLAY_PROPERTY places a property card in the correct color set', () => {
    const initial = createGame(TWO_PLAYERS, SEED);
    const { state: playing } = startTurn(initial, 'p1');

    const propertyCardId = findInHand(playing, 'p1', 'property');
    expect(propertyCardId).toBeDefined();

    const propertyCard = playing.cardMap[propertyCardId!] as PropertyCard;
    const { state, error } = applyAction(playing, 'p1', {
      type: 'PLAY_PROPERTY',
      cardId: propertyCardId!,
      setColor: propertyCard.color,
    });

    expect(error).toBeUndefined();
    expect(state.players[0].hand).not.toContain(propertyCardId);
    const set = state.players[0].propertySets.find(s => s.color === propertyCard.color);
    expect(set).toBeDefined();
    expect(set!.cards).toContain(propertyCardId);
    expect(state.playsRemaining).toBe(2);
  });

  // 7. MOVE_WILDCARD is free (doesn't cost a play)
  it('MOVE_WILDCARD does not decrement playsRemaining', () => {
    const initial = createGame(TWO_PLAYERS, SEED);
    const { state: playing } = startTurn(initial, 'p1');

    // Find any 2-color wildcard from the cardMap and inject it into p1's hand
    const twoColorWild = Object.values(playing.cardMap).find(
      c => c.type === 'wildcard' && !(c as WildcardCard).isMultiColor
    ) as WildcardCard | undefined;
    expect(twoColorWild).toBeDefined();

    const stateWithWild = {
      ...playing,
      players: playing.players.map(p =>
        p.id === 'p1' ? { ...p, hand: [twoColorWild!.id, ...p.hand.slice(0, 6)] } : p
      ),
    };

    const wildcardId = twoColorWild!.id;
    const [colorA, colorB] = twoColorWild!.colors;

    // First place the wildcard in colorA
    const { state: withWild, error: e1 } = applyAction(stateWithWild, 'p1', {
      type: 'PLAY_PROPERTY',
      cardId: wildcardId,
      setColor: colorA,
    });
    expect(e1).toBeUndefined();
    const playsAfterPlace = withWild.playsRemaining; // should be 2

    // Now move it to colorB — should be free
    const { state: afterMove, error: e2 } = applyAction(withWild, 'p1', {
      type: 'MOVE_WILDCARD',
      cardId: wildcardId,
      fromSetColor: colorA,
      toSetColor: colorB,
    });
    expect(e2).toBeUndefined();
    // playsRemaining should NOT have changed
    expect(afterMove.playsRemaining).toBe(playsAfterPlace);
    // Card should be in colorB set now
    const setB = afterMove.players[0].propertySets.find(s => s.color === colorB);
    expect(setB?.cards).toContain(wildcardId);
  });

  // 8. END_TURN with >7 cards is rejected
  it('END_TURN is rejected when player has more than 7 cards', () => {
    const initial = createGame(TWO_PLAYERS, SEED);
    const { state: playing } = startTurn(initial, 'p1');

    // Force player to have 8 cards in hand by stuffing the hand
    // p1 starts with 7 after draw; add 1 more from deck
    const extraCard = playing.deck[playing.deck.length - 1];
    const bloatedState = {
      ...playing,
      players: playing.players.map(p =>
        p.id === 'p1'
          ? { ...p, hand: [...p.hand, extraCard] }
          : p
      ),
      deck: playing.deck.slice(0, -1),
    };
    expect(bloatedState.players[0].hand.length).toBe(8);

    const { error } = applyAction(bloatedState, 'p1', { type: 'END_TURN' });
    expect(error).toBeDefined();
    expect(error).toMatch(/discard/i);
  });

  // 9. DISCARD reduces hand to exactly ≤ 7
  it('DISCARD reduces hand to ≤ 7 and advances to next player', () => {
    const initial = createGame(TWO_PLAYERS, SEED);
    const { state: playing } = startTurn(initial, 'p1');

    // Force player into AWAITING_DISCARD with 8 cards
    const extraCard = playing.deck[playing.deck.length - 1];
    const bloatedState = {
      ...playing,
      phase: 'AWAITING_DISCARD' as const,
      players: playing.players.map(p =>
        p.id === 'p1'
          ? { ...p, hand: [...p.hand, extraCard] }
          : p
      ),
      deck: playing.deck.slice(0, -1),
    };

    const cardToDiscard = bloatedState.players[0].hand[0];
    const { state, error } = applyAction(bloatedState, 'p1', {
      type: 'DISCARD',
      cardIds: [cardToDiscard],
    });

    expect(error).toBeUndefined();
    expect(state.players[0].hand.length).toBeLessThanOrEqual(7);
    expect(state.discard).toContain(cardToDiscard);
    // Should have advanced to next player
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.phase).toBe('AWAITING_TURN_START');
  });

  // 10. Can't play more than 3 cards per turn
  it('rejects a 4th play in a single turn', () => {
    const initial = createGame(TWO_PLAYERS, SEED);
    const { state: playing } = startTurn(initial, 'p1');

    // Force p1 to have plenty of money cards in hand so we can play 3
    // Take money cards from the cardMap and inject into hand
    const allMoneyIds = Object.values(playing.cardMap)
      .filter(c => c.type === 'money')
      .map(c => c.id);

    // Give p1 at least 4 money cards in hand (replacing the drawn hand)
    const stateWithMoney = {
      ...playing,
      players: playing.players.map(p => {
        if (p.id !== 'p1') return p;
        return { ...p, hand: allMoneyIds.slice(0, 7) };
      }),
    };

    // Play 3 money cards
    let state = stateWithMoney;
    for (let i = 0; i < 3; i++) {
      const moneyId = findInHand(state, 'p1', 'money');
      expect(moneyId).toBeDefined();
      const result = applyAction(state, 'p1', { type: 'PLAY_MONEY', cardId: moneyId! });
      expect(result.error).toBeUndefined();
      state = result.state;
    }

    expect(state.playsRemaining).toBe(0);

    // A 4th PLAY_MONEY should be rejected
    const extraMoneyId = findInHand(state, 'p1', 'money');
    expect(extraMoneyId).toBeDefined();
    const { error } = applyAction(state, 'p1', { type: 'PLAY_MONEY', cardId: extraMoneyId! });
    expect(error).toBeDefined();
    expect(error).toMatch(/no plays remaining/i);
  });

  // 11. Win detection: 3 complete different-color sets
  it('detects win when player completes 3 different-color sets', () => {
    const initial = createGame(TWO_PLAYERS, SEED);
    const { state: playing } = startTurn(initial, 'p1');

    // Inject 3 complete sets into p1's propertySets manually
    // Brown: 2 cards, Utility: 2 cards, DarkBlue: 2 cards
    const brownCards = Object.values(playing.cardMap).filter(
      c => c.type === 'property' && (c as PropertyCard).color === 'brown'
    ) as PropertyCard[];
    const utilityCards = Object.values(playing.cardMap).filter(
      c => c.type === 'property' && (c as PropertyCard).color === 'utility'
    ) as PropertyCard[];
    const darkBlueCards = Object.values(playing.cardMap).filter(
      c => c.type === 'property' && (c as PropertyCard).color === 'darkBlue'
    ) as PropertyCard[];

    const stateWith2Sets = {
      ...playing,
      players: playing.players.map(p => {
        if (p.id !== 'p1') return p;
        return {
          ...p,
          propertySets: [
            { color: 'brown' as Color, cards: brownCards.map(c => c.id), hasHouse: false, hasHotel: false },
            { color: 'utility' as Color, cards: utilityCards.map(c => c.id), hasHouse: false, hasHotel: false },
          ],
        };
      }),
    };

    // Add a darkBlue property card to p1's hand and play it
    const darkBlue1 = darkBlueCards[0];
    const darkBlue2 = darkBlueCards[1];

    const stateWithCards = {
      ...stateWith2Sets,
      players: stateWith2Sets.players.map(p => {
        if (p.id !== 'p1') return p;
        return { ...p, hand: [...p.hand.slice(0, 5), darkBlue1.id, darkBlue2.id] };
      }),
    };

    // Play darkBlue1 to start the set
    const { state: after1, error: e1 } = applyAction(stateWithCards, 'p1', {
      type: 'PLAY_PROPERTY',
      cardId: darkBlue1.id,
      setColor: 'darkBlue',
    });
    expect(e1).toBeUndefined();
    expect(after1.winnerId).toBeNull(); // only 1 card in darkBlue set

    // Play darkBlue2 to complete the set → should trigger win
    const { state: after2, error: e2 } = applyAction(after1, 'p1', {
      type: 'PLAY_PROPERTY',
      cardId: darkBlue2.id,
      setColor: 'darkBlue',
    });
    expect(e2).toBeUndefined();
    expect(after2.winnerId).toBe('p1');
    expect(after2.phase).toBe('FINISHED');
  });

  // 12. Win not detected with sets of only wildcards
  it('does not count a set as complete if it has only wildcards', () => {
    const initial = createGame(TWO_PLAYERS, SEED);
    const { state: playing } = startTurn(initial, 'p1');

    // Find multi-color wildcards
    const multiWilds = Object.values(playing.cardMap).filter(
      c => c.type === 'wildcard' && (c as WildcardCard).isMultiColor
    ) as WildcardCard[];

    // Build a "brown" set with only wildcards (brown needs 2 cards)
    // and real utility + darkBlue sets
    const utilityCards = Object.values(playing.cardMap).filter(
      c => c.type === 'property' && (c as PropertyCard).color === 'utility'
    ) as PropertyCard[];
    const darkBlueCards = Object.values(playing.cardMap).filter(
      c => c.type === 'property' && (c as PropertyCard).color === 'darkBlue'
    ) as PropertyCard[];

    const stateWithSets = {
      ...playing,
      players: playing.players.map(p => {
        if (p.id !== 'p1') return p;
        return {
          ...p,
          propertySets: [
            // "brown" set with only 2 wildcards — should NOT count
            {
              color: 'brown' as Color,
              cards: multiWilds.slice(0, 2).map(c => c.id),
              hasHouse: false,
              hasHotel: false,
            },
            // real utility set
            {
              color: 'utility' as Color,
              cards: utilityCards.map(c => c.id),
              hasHouse: false,
              hasHotel: false,
            },
            // real darkBlue set
            {
              color: 'darkBlue' as Color,
              cards: darkBlueCards.map(c => c.id),
              hasHouse: false,
              hasHotel: false,
            },
          ],
        };
      }),
    };

    // Even though brown has 2 cards (which equals SET_SIZES['brown']=2),
    // they're all wildcards, so the set should not be complete.
    // Trigger a win check by playing a money card
    const moneyId = findInHand(stateWithSets, 'p1', 'money');
    if (moneyId) {
      const { state } = applyAction(stateWithSets, 'p1', {
        type: 'PLAY_MONEY',
        cardId: moneyId,
      });
      // Win should NOT be triggered — only 2 real complete sets (utility + darkBlue)
      expect(state.winnerId).toBeNull();
      expect(state.phase).not.toBe('FINISHED');
    }
  });

  // 13. getRedactedView hides other players' hands
  it('getRedactedView does not expose other players hand cards', () => {
    const initial = createGame(TWO_PLAYERS, SEED);
    const view = getRedactedView(initial, 'p1');

    // p1 should see their own hand
    const selfView = view.players.find(p => p.id === 'p1')!;
    expect(selfView.hand).toBeDefined();
    expect(selfView.hand!.length).toBe(5);

    // p2's hand should NOT be visible
    const p2View = view.players.find(p => p.id === 'p2')!;
    expect(p2View.hand).toBeUndefined();
    expect(p2View.handCount).toBe(5);

    // Verify none of p2's actual card IDs appear in the view's top-level structure
    const p2Hand = initial.players.find(p => p.id === 'p2')!.hand;
    for (const _cardId of p2Hand) {
      // Card IDs should not appear in any hand array (they might appear in discardTop or other refs)
      // We check that p2View.hand is undefined (not an array with these IDs)
      expect(p2View.hand).toBeUndefined();
    }
  });

  // 14. PLAY_PROPERTY with wrong color is rejected
  it('PLAY_PROPERTY rejects wrong color for a property card', () => {
    const initial = createGame(TWO_PLAYERS, SEED);
    const { state: playing } = startTurn(initial, 'p1');

    const propertyId = findInHand(playing, 'p1', 'property');
    expect(propertyId).toBeDefined();

    const propertyCard = playing.cardMap[propertyId!] as PropertyCard;
    // Pick a wrong color (not the card's actual color)
    const allColors: Color[] = ['brown', 'lightBlue', 'pink', 'orange', 'red', 'yellow', 'green', 'darkBlue', 'railroad', 'utility'];
    const wrongColor = allColors.find(c => c !== propertyCard.color)!;

    const { error } = applyAction(playing, 'p1', {
      type: 'PLAY_PROPERTY',
      cardId: propertyId!,
      setColor: wrongColor,
    });

    expect(error).toBeDefined();
    expect(error).toMatch(new RegExp(propertyCard.color));
  });
});

// ---------------------------------------------------------------------------
// Engine actions tests (Milestone 3)
// ---------------------------------------------------------------------------

describe('Engine actions', () => {
  const TWO_PLAYERS = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ];
  const THREE_PLAYERS = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Charlie' },
  ];

  const allCards = buildDeck();
  const cardMap: Record<string, Card> = {};
  for (const c of allCards) cardMap[c.id] = c;

  // Convenience: get all cards of a type from the master deck
  function allOfType<T extends Card>(type: string): T[] {
    return allCards.filter(c => c.type === type) as T[];
  }
  function allActions(action: ActionCard['action']): ActionCard[] {
    return allCards.filter(c => c.type === 'action' && (c as ActionCard).action === action) as ActionCard[];
  }
  function allPropertiesOfColor(color: Color): PropertyCard[] {
    return allCards.filter(c => c.type === 'property' && (c as PropertyCard).color === color) as PropertyCard[];
  }
  function allRents(wild?: boolean): RentCard[] {
    return allCards.filter(c => c.type === 'rent' && (wild === undefined || (c as RentCard).isWild === wild)) as RentCard[];
  }

  /** Build a state in PLAYING phase with p1 as current player. */
  function playingState(overrides?: {
    p1Hand?: string[];
    p2Hand?: string[];
    p3Hand?: string[];
    p1Bank?: string[];
    p2Bank?: string[];
    p1Sets?: PropertySet[];
    p2Sets?: PropertySet[];
    p3Sets?: PropertySet[];
    players?: { id: string; name: string }[];
    playsRemaining?: number;
  }): GameState {
    const playerDefs = overrides?.players ?? TWO_PLAYERS;
    const state = createGame(playerDefs, 42);
    const baseState: GameState = {
      ...state,
      phase: 'PLAYING',
      playsRemaining: overrides?.playsRemaining ?? 3,
      players: state.players.map(p => {
        const updates: Partial<PlayerState> = {};
        if (p.id === 'p1') {
          if (overrides?.p1Hand !== undefined) updates.hand = overrides.p1Hand;
          if (overrides?.p1Bank !== undefined) updates.bank = overrides.p1Bank;
          if (overrides?.p1Sets !== undefined) updates.propertySets = overrides.p1Sets;
        }
        if (p.id === 'p2') {
          if (overrides?.p2Hand !== undefined) updates.hand = overrides.p2Hand;
          if (overrides?.p2Bank !== undefined) updates.bank = overrides.p2Bank;
          if (overrides?.p2Sets !== undefined) updates.propertySets = overrides.p2Sets;
        }
        if (p.id === 'p3') {
          if (overrides?.p3Hand !== undefined) updates.hand = overrides.p3Hand;
          if (overrides?.p3Sets !== undefined) updates.propertySets = overrides.p3Sets;
        }
        return { ...p, ...updates };
      }),
    };
    return baseState;
  }

  function makeSet(color: Color, cards: string[], hasHouse = false, hasHotel = false, houseCardId?: string, hotelCardId?: string): PropertySet {
    return { color, cards, hasHouse, hasHotel, houseCardId, hotelCardId };
  }

  // -------------------------------------------------------------------------
  // RENT TESTS
  // -------------------------------------------------------------------------

  // Helper: advance through JSN window by having all listed targets RESPOND_ALLOW
  function allowAllJsn(state: GameState, targetIds: string[]): GameState {
    let s = state;
    for (const tid of targetIds) {
      const result = applyAction(s, tid, { type: 'RESPOND_ALLOW' });
      expect(result.error).toBeUndefined();
      s = result.state;
    }
    return s;
  }

  describe('PLAY_RENT', () => {
    // Test 1: 2-color rent card charges all opponents correct amount
    it('2-color rent card charges all opponents correct amount based on set size', () => {
      const greenProps = allPropertiesOfColor('green'); // 3 cards; ladder [2, 4, 7]
      const rentCard = allRents(false).find(r => r.colors.includes('green'))!;
      expect(rentCard).toBeDefined();

      // 1 green property → rent = $2M
      const state1 = playingState({
        p1Hand: [rentCard.id],
        p1Sets: [makeSet('green', [greenProps[0]!.id])],
      });
      const { state: jsn1, error: e1 } = applyAction(state1, 'p1', {
        type: 'PLAY_RENT',
        cardId: rentCard.id,
        chosenColor: 'green',
      });
      expect(e1).toBeUndefined();
      expect(jsn1.phase).toBe('AWAITING_RESPONSES');
      // Target allows → payment phase
      const s1 = allowAllJsn(jsn1, ['p2']);
      expect(s1.phase).toBe('AWAITING_PAYMENT');
      expect(s1.pendingInteraction!.debts[0]!.amountOwed).toBe(RENT_LADDERS['green'][0]!); // $2M

      // 3 green properties → rent = $7M (complete set)
      const rentCard2 = allRents(false).find(r => r.colors.includes('green') && r.id !== rentCard.id)!;
      const state3 = playingState({
        p1Hand: [rentCard2.id],
        p1Sets: [makeSet('green', greenProps.map(c => c.id))],
      });
      const { state: jsn3, error: e3 } = applyAction(state3, 'p1', {
        type: 'PLAY_RENT',
        cardId: rentCard2.id,
        chosenColor: 'green',
      });
      expect(e3).toBeUndefined();
      const s3 = allowAllJsn(jsn3, ['p2']);
      expect(s3.pendingInteraction!.debts[0]!.amountOwed).toBe(RENT_LADDERS['green'][2]!); // $7M
    });

    // Test 2: Wild rent charges single target only
    it('wild rent card charges only the specified target', () => {
      const greenProps = allPropertiesOfColor('green');
      const wildRentCard = allRents(true)[0]!;
      const state = playingState({
        players: THREE_PLAYERS,
        p1Hand: [wildRentCard.id],
        p1Sets: [makeSet('green', [greenProps[0]!.id])],
      });
      const { state: jsn, error } = applyAction(state, 'p1', {
        type: 'PLAY_RENT',
        cardId: wildRentCard.id,
        chosenColor: 'green',
        targetId: 'p2',
      });
      expect(error).toBeUndefined();
      expect(jsn.phase).toBe('AWAITING_RESPONSES');
      // p2 allows → payment phase with only p2 owing
      const s = allowAllJsn(jsn, ['p2']);
      expect(s.pendingInteraction!.debts).toHaveLength(1);
      expect(s.pendingInteraction!.debts[0]!.debtorId).toBe('p2');
      // p3 owes nothing
    });

    // Test 3: Double the Rent doubles the amount
    it('one Double the Rent card doubles the rent amount', () => {
      const greenProps = allPropertiesOfColor('green');
      const rentCard = allRents(false).find(r => r.colors.includes('green'))!;
      const doubleCard = allActions('doubleTheRent')[0]!;
      // 1 green prop → base rent $2M; with double → $4M
      const state = playingState({
        p1Hand: [rentCard.id, doubleCard.id],
        p1Sets: [makeSet('green', [greenProps[0]!.id])],
      });
      const { state: jsn, error } = applyAction(state, 'p1', {
        type: 'PLAY_RENT',
        cardId: rentCard.id,
        chosenColor: 'green',
        doubleCardIds: [doubleCard.id],
      });
      expect(error).toBeUndefined();
      const s = allowAllJsn(jsn, ['p2']);
      expect(s.pendingInteraction!.debts[0]!.amountOwed).toBe(RENT_LADDERS['green'][0]! * 2); // $4M
    });

    // Test 4: Two Doubles makes 4x rent
    it('two Double the Rent cards quadruple the rent amount', () => {
      const greenProps = allPropertiesOfColor('green');
      const rentCard = allRents(false).find(r => r.colors.includes('green'))!;
      const doubleCards = allActions('doubleTheRent'); // there are 2
      expect(doubleCards.length).toBeGreaterThanOrEqual(2);
      const dc0 = doubleCards[0]!;
      const dc1 = doubleCards[1]!;
      const state = playingState({
        p1Hand: [rentCard.id, dc0.id, dc1.id],
        p1Sets: [makeSet('green', [greenProps[0]!.id])],
      });
      const { state: jsn, error } = applyAction(state, 'p1', {
        type: 'PLAY_RENT',
        cardId: rentCard.id,
        chosenColor: 'green',
        doubleCardIds: [dc0.id, dc1.id],
      });
      expect(error).toBeUndefined();
      const s = allowAllJsn(jsn, ['p2']);
      expect(s.pendingInteraction!.debts[0]!.amountOwed).toBe(RENT_LADDERS['green'][0]! * 4); // $8M
    });

    // Test 5: Rent + Double consumes 2 plays
    it('rent + one Double consumes 2 plays', () => {
      const greenProps = allPropertiesOfColor('green');
      const rentCard = allRents(false).find(r => r.colors.includes('green'))!;
      const doubleCard = allActions('doubleTheRent')[0]!;
      const state = playingState({
        p1Hand: [rentCard.id, doubleCard.id],
        p1Sets: [makeSet('green', [greenProps[0]!.id])],
        playsRemaining: 3,
      });
      const { state: s, error } = applyAction(state, 'p1', {
        type: 'PLAY_RENT',
        cardId: rentCard.id,
        chosenColor: 'green',
        doubleCardIds: [doubleCard.id],
      });
      expect(error).toBeUndefined();
      // playsRemaining is decremented when rent is played (before JSN window)
      expect(s.playsRemaining).toBe(1); // 3 - 2 = 1
    });

    // Test 6: Rent on set with House adds HOUSE_BONUS
    it('rent on a set with house adds +$3M', () => {
      const greenProps = allPropertiesOfColor('green');
      const rentCard = allRents(false).find(r => r.colors.includes('green'))!;
      const houseCard = allActions('house')[0]!;
      // Complete green set with house
      const state = playingState({
        p1Hand: [rentCard.id],
        p1Sets: [makeSet('green', greenProps.map(c => c.id), true, false, houseCard.id)],
      });
      const { state: jsn, error } = applyAction(state, 'p1', {
        type: 'PLAY_RENT',
        cardId: rentCard.id,
        chosenColor: 'green',
      });
      expect(error).toBeUndefined();
      const s = allowAllJsn(jsn, ['p2']);
      const expectedRent = RENT_LADDERS['green'][2]! + HOUSE_BONUS; // $7M + $3M = $10M
      expect(s.pendingInteraction!.debts[0]!.amountOwed).toBe(expectedRent);
    });

    // Test 7: Rent on set with House+Hotel adds both bonuses
    it('rent on a set with house and hotel adds +$3M +$4M', () => {
      const greenProps = allPropertiesOfColor('green');
      const rentCard = allRents(false).find(r => r.colors.includes('green'))!;
      const houseCard = allActions('house')[0]!;
      const hotelCard = allActions('hotel')[0]!;
      // Complete green set with house and hotel
      const state = playingState({
        p1Hand: [rentCard.id],
        p1Sets: [makeSet('green', greenProps.map(c => c.id), true, true, houseCard.id, hotelCard.id)],
      });
      const { state: jsn, error } = applyAction(state, 'p1', {
        type: 'PLAY_RENT',
        cardId: rentCard.id,
        chosenColor: 'green',
      });
      expect(error).toBeUndefined();
      const s = allowAllJsn(jsn, ['p2']);
      const expectedRent = RENT_LADDERS['green'][2]! + HOUSE_BONUS + HOTEL_BONUS; // $7 + $3 + $4 = $14M
      expect(s.pendingInteraction!.debts[0]!.amountOwed).toBe(expectedRent);
    });

    // Test 8: Cannot play rent for a color you don't own
    it('cannot play rent for a color you have no properties in', () => {
      const rentCard = allRents(false).find(r => r.colors.includes('green'))!;
      const state = playingState({
        p1Hand: [rentCard.id],
        p1Sets: [], // no properties
      });
      const { error } = applyAction(state, 'p1', {
        type: 'PLAY_RENT',
        cardId: rentCard.id,
        chosenColor: 'green',
      });
      expect(error).toBeDefined();
      expect(error).toMatch(/don't own/i);
    });

    // Test 9: Wild rent card requires targetId
    it('wild rent card requires a targetId', () => {
      const greenProps = allPropertiesOfColor('green');
      const wildRentCard = allRents(true)[0]!;
      const state = playingState({
        p1Hand: [wildRentCard.id],
        p1Sets: [makeSet('green', [greenProps[0]!.id])],
      });
      const { error } = applyAction(state, 'p1', {
        type: 'PLAY_RENT',
        cardId: wildRentCard.id,
        chosenColor: 'green',
        // no targetId
      });
      expect(error).toBeDefined();
      expect(error).toMatch(/targetId/i);
    });
  });

  // -------------------------------------------------------------------------
  // PAYMENT TESTS
  // -------------------------------------------------------------------------

  describe('PAY', () => {
    // Helper: set up a state where p2 owes p1 a debt
    function debtState(amountOwed: number, p2BankCards: string[], p2PropertySets: PropertySet[] = []) {
      const state = playingState({
        p1Hand: [],
        p2Bank: p2BankCards,
        p2Sets: p2PropertySets,
        playsRemaining: 2,
      });
      // Inject pending payment manually
      return {
        ...state,
        phase: 'AWAITING_PAYMENT' as const,
        pendingInteraction: {
          type: 'PAYMENT' as const,
          initiatorId: 'p1',
          recipientId: 'p1',
          debts: [{ debtorId: 'p2', amountOwed, paid: false, cardsPaid: [] }],
          jsnChain: [],
        },
      };
    }

    // Test 10: PAY transfers money cards to recipient's bank
    it('PAY transfers money cards to recipient bank', () => {
      const moneyCard = allOfType<MoneyCard>('money').find(c => c.value >= 5)!;
      const state = debtState(5, [moneyCard.id]);
      const { state: s, error } = applyAction(state, 'p2', {
        type: 'PAY',
        cardIds: [moneyCard.id],
      });
      expect(error).toBeUndefined();
      expect(s.players.find(p => p.id === 'p1')!.bank).toContain(moneyCard.id);
      expect(s.players.find(p => p.id === 'p2')!.bank).not.toContain(moneyCard.id);
    });

    // Test 11: PAY transfers property cards to recipient's property area
    it('PAY transfers property cards to recipient property area', () => {
      const greenProp = allPropertiesOfColor('green')[0]!;
      const state = debtState(4, [], [makeSet('green', [greenProp.id])]);
      const { state: s, error } = applyAction(state, 'p2', {
        type: 'PAY',
        cardIds: [greenProp.id],
      });
      expect(error).toBeUndefined();
      const p1 = s.players.find(p => p.id === 'p1')!;
      const greenSet = p1.propertySets.find(ps => ps.color === 'green');
      expect(greenSet?.cards).toContain(greenProp.id);
      const p2 = s.players.find(p => p.id === 'p2')!;
      const p2Green = p2.propertySets.find(ps => ps.color === 'green');
      expect(p2Green?.cards ?? []).not.toContain(greenProp.id);
    });

    // Test 12: Overpaying — paying $5M when owed $2M is allowed
    it('overpaying is allowed (no change given)', () => {
      const moneyCard = allOfType<MoneyCard>('money').find(c => c.value === 5)!;
      const state = debtState(2, [moneyCard.id]);
      const { state: s, error } = applyAction(state, 'p2', {
        type: 'PAY',
        cardIds: [moneyCard.id],
      });
      expect(error).toBeUndefined();
      // Payment went through, phase returns to PLAYING
      expect(s.phase).toBe('PLAYING');
      expect(s.players.find(p => p.id === 'p1')!.bank).toContain(moneyCard.id);
    });

    // Test 13: Partial pay when broke — pay everything, remainder forgiven
    it('pays everything when total assets < amount owed', () => {
      const moneyCard1M = allOfType<MoneyCard>('money').find(c => c.value === 1)!;
      // p2 only has $1M, owes $5M
      const state = debtState(5, [moneyCard1M.id]);
      const { state: s, error } = applyAction(state, 'p2', {
        type: 'PAY',
        cardIds: [moneyCard1M.id],
      });
      expect(error).toBeUndefined();
      expect(s.phase).toBe('PLAYING');
    });

    // Test 14: Pay nothing when completely broke
    it('can pay with empty cardIds when player has no assets', () => {
      const state = debtState(5, []); // p2 has no bank, no properties
      const { state: s, error } = applyAction(state, 'p2', {
        type: 'PAY',
        cardIds: [],
      });
      expect(error).toBeUndefined();
      expect(s.phase).toBe('PLAYING');
    });

    // Test 15: Multi-color wildcard cannot be used as payment
    it('multi-color wildcard cannot be used as payment', () => {
      const multiWild = allOfType<WildcardCard>('wildcard').find(c => c.isMultiColor)!;
      const state = debtState(2, []);
      // Put multi-color wildcard in p2's property set
      const stateWithWild: GameState = {
        ...state,
        players: state.players.map(p =>
          p.id === 'p2'
            ? { ...p, propertySets: [makeSet('brown', [multiWild.id])] }
            : p
        ),
      };
      const { error } = applyAction(stateWithWild, 'p2', {
        type: 'PAY',
        cardIds: [multiWild.id],
      });
      expect(error).toBeDefined();
      expect(error).toMatch(/multi-color/i);
    });

    // Test 16: After last debtor pays, phase returns to PLAYING
    it('after all debts paid, phase returns to PLAYING', () => {
      const moneyCard = allOfType<MoneyCard>('money').find(c => c.value === 5)!;
      const state = debtState(5, [moneyCard.id]);
      const { state: s } = applyAction(state, 'p2', {
        type: 'PAY',
        cardIds: [moneyCard.id],
      });
      expect(s.phase).toBe('PLAYING');
      expect(s.pendingInteraction).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // DEBT COLLECTOR TESTS
  // -------------------------------------------------------------------------

  describe('PLAY_DEBT_COLLECTOR', () => {
    // Test 17: Sets up $5M debt for target
    it('PLAY_DEBT_COLLECTOR sets up $5M debt for the target', () => {
      const debtCard = allActions('debtCollector')[0]!;
      const state = playingState({ p1Hand: [debtCard.id] });
      const { state: jsn, error } = applyAction(state, 'p1', {
        type: 'PLAY_DEBT_COLLECTOR',
        cardId: debtCard.id,
        targetId: 'p2',
      });
      expect(error).toBeUndefined();
      expect(jsn.phase).toBe('AWAITING_RESPONSES');
      // Target allows → payment phase
      const s = allowAllJsn(jsn, ['p2']);
      expect(s.phase).toBe('AWAITING_PAYMENT');
      expect(s.pendingInteraction!.debts[0]!.debtorId).toBe('p2');
      expect(s.pendingInteraction!.debts[0]!.amountOwed).toBe(5);
    });

    // Test 18: Cannot target self
    it('cannot target self with Debt Collector', () => {
      const debtCard = allActions('debtCollector')[0]!;
      const state = playingState({ p1Hand: [debtCard.id] });
      const { error } = applyAction(state, 'p1', {
        type: 'PLAY_DEBT_COLLECTOR',
        cardId: debtCard.id,
        targetId: 'p1',
      });
      expect(error).toBeDefined();
      expect(error).toMatch(/yourself/i);
    });
  });

  // -------------------------------------------------------------------------
  // BIRTHDAY TESTS
  // -------------------------------------------------------------------------

  describe('PLAY_BIRTHDAY', () => {
    // Test 19: Sets up $2M debt for each opponent
    it('PLAY_BIRTHDAY sets up $2M debt for each opponent (3-player game)', () => {
      const birthdayCard = allActions('birthday')[0]!;
      const state = playingState({
        players: THREE_PLAYERS,
        p1Hand: [birthdayCard.id],
      });
      const { state: jsn, error } = applyAction(state, 'p1', {
        type: 'PLAY_BIRTHDAY',
        cardId: birthdayCard.id,
      });
      expect(error).toBeUndefined();
      expect(jsn.phase).toBe('AWAITING_RESPONSES');
      // Both opponents allow → payment phase
      const s = allowAllJsn(jsn, ['p2', 'p3']);
      expect(s.phase).toBe('AWAITING_PAYMENT');
      expect(s.pendingInteraction!.debts).toHaveLength(2); // p2 and p3
      expect(s.pendingInteraction!.debts.every(d => d.amountOwed === 2)).toBe(true);
    });

    // Test 20: Multiple opponents pay separately
    it('PLAY_BIRTHDAY — all opponents pay separately', () => {
      const birthdayCard = allActions('birthday')[0]!;
      const money2M = allOfType<MoneyCard>('money').filter(c => c.value === 2);
      // p2 and p3 each have a $2M card
      const p2Money = money2M[0]!;
      const p3Money = money2M[1]!;

      const baseState = createGame(THREE_PLAYERS, 42);
      const state: GameState = {
        ...baseState,
        phase: 'PLAYING',
        playsRemaining: 3,
        players: baseState.players.map(p => {
          if (p.id === 'p1') return { ...p, hand: [birthdayCard.id] };
          if (p.id === 'p2') return { ...p, bank: [p2Money.id] };
          if (p.id === 'p3') return { ...p, bank: [p3Money.id] };
          return p;
        }),
      };

      // Play birthday → JSN window
      const { state: afterBirthday } = applyAction(state, 'p1', {
        type: 'PLAY_BIRTHDAY',
        cardId: birthdayCard.id,
      });
      expect(afterBirthday.phase).toBe('AWAITING_RESPONSES');

      // Both opponents allow → payment phase
      const afterAllAllow = allowAllJsn(afterBirthday, ['p2', 'p3']);
      expect(afterAllAllow.phase).toBe('AWAITING_PAYMENT');

      // p2 pays first
      const { state: afterP2Pays, error: e2 } = applyAction(afterAllAllow, 'p2', {
        type: 'PAY',
        cardIds: [p2Money.id],
      });
      expect(e2).toBeUndefined();
      expect(afterP2Pays.phase).toBe('AWAITING_PAYMENT'); // still waiting for p3

      // p3 pays
      const { state: afterP3Pays, error: e3 } = applyAction(afterP2Pays, 'p3', {
        type: 'PAY',
        cardIds: [p3Money.id],
      });
      expect(e3).toBeUndefined();
      expect(afterP3Pays.phase).toBe('PLAYING'); // all paid, back to playing
    });
  });

  // -------------------------------------------------------------------------
  // SLY DEAL TESTS
  // -------------------------------------------------------------------------

  describe('PLAY_SLY_DEAL', () => {
    // Test 21: Steals a card from an incomplete set
    it('PLAY_SLY_DEAL steals a card from an incomplete set', () => {
      const slyCard = allActions('slyDeal')[0]!;
      const yellowProp = allPropertiesOfColor('yellow')[0]!; // incomplete set (only 1 of 3)
      const state = playingState({
        p1Hand: [slyCard.id],
        p2Sets: [makeSet('yellow', [yellowProp.id])],
      });
      const { state: jsn, error } = applyAction(state, 'p1', {
        type: 'PLAY_SLY_DEAL',
        cardId: slyCard.id,
        targetId: 'p2',
        targetCardId: yellowProp.id,
      });
      expect(error).toBeUndefined();
      expect(jsn.phase).toBe('AWAITING_RESPONSES');
      // Target allows → steal executes
      const s = allowAllJsn(jsn, ['p2']);
      // p1 should now have the yellow property
      const p1YellowSet = s.players.find(p => p.id === 'p1')!.propertySets.find(ps => ps.color === 'yellow');
      expect(p1YellowSet?.cards).toContain(yellowProp.id);
      // p2 should not have it
      const p2YellowSet = s.players.find(p => p.id === 'p2')!.propertySets.find(ps => ps.color === 'yellow');
      expect(p2YellowSet?.cards ?? []).not.toContain(yellowProp.id);
    });

    // Test 22: Cannot steal from a complete set
    it('cannot steal from a complete set', () => {
      const slyCard = allActions('slyDeal')[0]!;
      const yellowProps = allPropertiesOfColor('yellow'); // 3 cards = complete
      const state = playingState({
        p1Hand: [slyCard.id],
        p2Sets: [makeSet('yellow', yellowProps.map(c => c.id))],
      });
      const { error } = applyAction(state, 'p1', {
        type: 'PLAY_SLY_DEAL',
        cardId: slyCard.id,
        targetId: 'p2',
        targetCardId: yellowProps[0]!.id,
      });
      expect(error).toBeDefined();
      expect(error).toMatch(/complete/i);
    });

    // Test 23: Stolen wildcard keeps its color
    it('stolen wildcard stays in the same color set', () => {
      const slyCard = allActions('slyDeal')[0]!;
      // Use a wildcard that covers yellow
      const yellowWild = allOfType<WildcardCard>('wildcard').find(
        c => !c.isMultiColor && c.colors.includes('yellow')
      )!;
      const state = playingState({
        p1Hand: [slyCard.id],
        p2Sets: [makeSet('yellow', [yellowWild.id])],
      });
      const { state: jsn, error } = applyAction(state, 'p1', {
        type: 'PLAY_SLY_DEAL',
        cardId: slyCard.id,
        targetId: 'p2',
        targetCardId: yellowWild.id,
      });
      expect(error).toBeUndefined();
      const s = allowAllJsn(jsn, ['p2']);
      const p1YellowSet = s.players.find(p => p.id === 'p1')!.propertySets.find(ps => ps.color === 'yellow');
      expect(p1YellowSet?.cards).toContain(yellowWild.id);
    });
  });

  // -------------------------------------------------------------------------
  // FORCED DEAL TESTS
  // -------------------------------------------------------------------------

  describe('PLAY_FORCED_DEAL', () => {
    // Test 24: Swaps two properties between players
    it('PLAY_FORCED_DEAL swaps properties between players', () => {
      const forcedCard = allActions('forcedDeal')[0]!;
      const p1Green = allPropertiesOfColor('green')[0]!; // p1 has 1 green (not complete)
      const p2Yellow = allPropertiesOfColor('yellow')[0]!; // p2 has 1 yellow (not complete)
      const state = playingState({
        p1Hand: [forcedCard.id],
        p1Sets: [makeSet('green', [p1Green.id])],
        p2Sets: [makeSet('yellow', [p2Yellow.id])],
      });
      const { state: jsn, error } = applyAction(state, 'p1', {
        type: 'PLAY_FORCED_DEAL',
        cardId: forcedCard.id,
        targetId: 'p2',
        targetCardId: p2Yellow.id,
        myCardId: p1Green.id,
      });
      expect(error).toBeUndefined();
      expect(jsn.phase).toBe('AWAITING_RESPONSES');
      // Target allows → swap executes
      const s = allowAllJsn(jsn, ['p2']);
      const p1 = s.players.find(p => p.id === 'p1')!;
      const p2 = s.players.find(p => p.id === 'p2')!;
      // p1 should have yellow, not green
      expect(p1.propertySets.find(ps => ps.color === 'yellow')?.cards).toContain(p2Yellow.id);
      expect(p1.propertySets.find(ps => ps.color === 'green')?.cards ?? []).not.toContain(p1Green.id);
      // p2 should have green, not yellow
      expect(p2.propertySets.find(ps => ps.color === 'green')?.cards).toContain(p1Green.id);
      expect(p2.propertySets.find(ps => ps.color === 'yellow')?.cards ?? []).not.toContain(p2Yellow.id);
    });

    // Test 25: Cannot swap from a complete set
    it('cannot force a deal involving a complete set (target)', () => {
      const forcedCard = allActions('forcedDeal')[0]!;
      const p1Green = allPropertiesOfColor('green')[0]!;
      const p2Yellow = allPropertiesOfColor('yellow'); // 3 cards = complete
      const state = playingState({
        p1Hand: [forcedCard.id],
        p1Sets: [makeSet('green', [p1Green.id])],
        p2Sets: [makeSet('yellow', p2Yellow.map(c => c.id))],
      });
      const { error } = applyAction(state, 'p1', {
        type: 'PLAY_FORCED_DEAL',
        cardId: forcedCard.id,
        targetId: 'p2',
        targetCardId: p2Yellow[0]!.id,
        myCardId: p1Green.id,
      });
      expect(error).toBeDefined();
      expect(error).toMatch(/complete/i);
    });
  });

  // -------------------------------------------------------------------------
  // DEAL BREAKER TESTS
  // -------------------------------------------------------------------------

  describe('PLAY_DEAL_BREAKER', () => {
    // Test 26: Steals entire complete set including house/hotel
    it('PLAY_DEAL_BREAKER steals entire complete set including house and hotel', () => {
      const dealBreakerCard = allActions('dealBreaker')[0]!;
      const yellowProps = allPropertiesOfColor('yellow'); // 3 cards = complete set
      const houseCard = allActions('house')[0]!;
      const hotelCard = allActions('hotel')[0]!;

      const p2Set = makeSet('yellow', yellowProps.map(c => c.id), true, true, houseCard.id, hotelCard.id);
      const state = playingState({
        p1Hand: [dealBreakerCard.id],
        p2Sets: [p2Set],
      });
      const { state: jsn, error } = applyAction(state, 'p1', {
        type: 'PLAY_DEAL_BREAKER',
        cardId: dealBreakerCard.id,
        targetId: 'p2',
        setColor: 'yellow',
      });
      expect(error).toBeUndefined();
      expect(jsn.phase).toBe('AWAITING_RESPONSES');
      // Target allows → steal executes
      const s = allowAllJsn(jsn, ['p2']);
      const p1 = s.players.find(p => p.id === 'p1')!;
      const p2 = s.players.find(p => p.id === 'p2')!;
      const p1Yellow = p1.propertySets.find(ps => ps.color === 'yellow');
      expect(p1Yellow?.cards).toEqual(yellowProps.map(c => c.id));
      expect(p1Yellow?.hasHouse).toBe(true);
      expect(p1Yellow?.hasHotel).toBe(true);
      expect(p1Yellow?.houseCardId).toBe(houseCard.id);
      expect(p1Yellow?.hotelCardId).toBe(hotelCard.id);
      expect(p2.propertySets.find(ps => ps.color === 'yellow')).toBeUndefined();
    });

    // Test 27: Cannot steal an incomplete set
    it('cannot deal break an incomplete set', () => {
      const dealBreakerCard = allActions('dealBreaker')[0]!;
      const yellowProp = allPropertiesOfColor('yellow')[0]!; // only 1 card
      const state = playingState({
        p1Hand: [dealBreakerCard.id],
        p2Sets: [makeSet('yellow', [yellowProp.id])],
      });
      const { error } = applyAction(state, 'p1', {
        type: 'PLAY_DEAL_BREAKER',
        cardId: dealBreakerCard.id,
        targetId: 'p2',
        setColor: 'yellow',
      });
      expect(error).toBeDefined();
      expect(error).toMatch(/not complete/i);
    });

    // Test 28: Win condition checked after deal breaker
    it('win condition is checked after deal breaker', () => {
      const dealBreakerCard = allActions('dealBreaker')[0]!;
      const yellowProps = allPropertiesOfColor('yellow');
      const brownProps = allPropertiesOfColor('brown');
      const utilityProps = allPropertiesOfColor('utility');

      // p1 already has 2 complete sets, stealing yellow completes the win
      const p1Sets = [
        makeSet('brown', brownProps.map(c => c.id)),
        makeSet('utility', utilityProps.map(c => c.id)),
      ];
      const p2Sets = [makeSet('yellow', yellowProps.map(c => c.id))];

      const state = playingState({
        p1Hand: [dealBreakerCard.id],
        p1Sets,
        p2Sets,
      });
      const { state: jsn, error } = applyAction(state, 'p1', {
        type: 'PLAY_DEAL_BREAKER',
        cardId: dealBreakerCard.id,
        targetId: 'p2',
        setColor: 'yellow',
      });
      expect(error).toBeUndefined();
      expect(jsn.phase).toBe('AWAITING_RESPONSES');
      // Target allows → steal executes + win detected
      const s = allowAllJsn(jsn, ['p2']);
      expect(s.winnerId).toBe('p1');
      expect(s.phase).toBe('FINISHED');
    });
  });

  // -------------------------------------------------------------------------
  // HOUSE / HOTEL TESTS
  // -------------------------------------------------------------------------

  describe('PLAY_HOUSE', () => {
    // Test 29: Adds house to complete non-railroad/utility set
    it('PLAY_HOUSE adds a house to a complete set', () => {
      const houseCard = allActions('house')[0]!;
      const greenProps = allPropertiesOfColor('green');
      const state = playingState({
        p1Hand: [houseCard.id],
        p1Sets: [makeSet('green', greenProps.map(c => c.id))],
      });
      const { state: s, error } = applyAction(state, 'p1', {
        type: 'PLAY_HOUSE',
        cardId: houseCard.id,
        setColor: 'green',
      });
      expect(error).toBeUndefined();
      const greenSet = s.players.find(p => p.id === 'p1')!.propertySets.find(ps => ps.color === 'green');
      expect(greenSet?.hasHouse).toBe(true);
      expect(greenSet?.houseCardId).toBe(houseCard.id);
      expect(s.playsRemaining).toBe(2); // consumed 1 play
    });

    // Test 30: Cannot play house on incomplete set
    it('cannot play PLAY_HOUSE on an incomplete set', () => {
      const houseCard = allActions('house')[0]!;
      const greenProp = allPropertiesOfColor('green')[0]!; // only 1 of 3
      const state = playingState({
        p1Hand: [houseCard.id],
        p1Sets: [makeSet('green', [greenProp.id])],
      });
      const { error } = applyAction(state, 'p1', {
        type: 'PLAY_HOUSE',
        cardId: houseCard.id,
        setColor: 'green',
      });
      expect(error).toBeDefined();
      expect(error).toMatch(/not complete/i);
    });

    // Test 31: Cannot play house on railroad set
    it('cannot play PLAY_HOUSE on a railroad set', () => {
      const houseCard = allActions('house')[0]!;
      const railroadProps = allPropertiesOfColor('railroad'); // 4 cards needed for complete
      const state = playingState({
        p1Hand: [houseCard.id],
        p1Sets: [makeSet('railroad', railroadProps.map(c => c.id))],
      });
      const { error } = applyAction(state, 'p1', {
        type: 'PLAY_HOUSE',
        cardId: houseCard.id,
        setColor: 'railroad',
      });
      expect(error).toBeDefined();
      expect(error).toMatch(/railroad/i);
    });

    // Test 32: Cannot play house if set already has one
    it('cannot play PLAY_HOUSE if set already has a house', () => {
      const houseCard = allActions('house')[0]!;
      const anotherHouseCard = allActions('house')[1]!;
      const greenProps = allPropertiesOfColor('green');
      const state = playingState({
        p1Hand: [anotherHouseCard.id],
        p1Sets: [makeSet('green', greenProps.map(c => c.id), true, false, houseCard.id)],
      });
      const { error } = applyAction(state, 'p1', {
        type: 'PLAY_HOUSE',
        cardId: anotherHouseCard.id,
        setColor: 'green',
      });
      expect(error).toBeDefined();
      expect(error).toMatch(/already has/i);
    });
  });

  describe('PLAY_HOTEL', () => {
    // Test 33: Hotel requires existing house
    it('PLAY_HOTEL requires a house on the set first', () => {
      const hotelCard = allActions('hotel')[0]!;
      const greenProps = allPropertiesOfColor('green');
      const state = playingState({
        p1Hand: [hotelCard.id],
        p1Sets: [makeSet('green', greenProps.map(c => c.id), false)], // no house
      });
      const { error } = applyAction(state, 'p1', {
        type: 'PLAY_HOTEL',
        cardId: hotelCard.id,
        setColor: 'green',
      });
      expect(error).toBeDefined();
      expect(error).toMatch(/house/i);
    });

    // Test 34: Hotel is stored with its card ID on the set
    it('PLAY_HOTEL stores house and hotel card IDs on the set', () => {
      const houseCard = allActions('house')[0]!;
      const hotelCard = allActions('hotel')[0]!;
      const greenProps = allPropertiesOfColor('green');

      // Start with complete green set + house
      const state = playingState({
        p1Hand: [hotelCard.id],
        p1Sets: [makeSet('green', greenProps.map(c => c.id), true, false, houseCard.id)],
      });
      const { state: s, error } = applyAction(state, 'p1', {
        type: 'PLAY_HOTEL',
        cardId: hotelCard.id,
        setColor: 'green',
      });
      expect(error).toBeUndefined();
      const greenSet = s.players.find(p => p.id === 'p1')!.propertySets.find(ps => ps.color === 'green');
      expect(greenSet?.hasHotel).toBe(true);
      expect(greenSet?.hotelCardId).toBe(hotelCard.id);
      expect(greenSet?.houseCardId).toBe(houseCard.id); // house still stored
    });

    // Test 35: Cannot play hotel on utility set
    it('cannot play PLAY_HOTEL on a utility set', () => {
      const houseCard = allActions('house')[0]!;
      const hotelCard = allActions('hotel')[0]!;
      const utilityProps = allPropertiesOfColor('utility');
      const state = playingState({
        p1Hand: [hotelCard.id],
        p1Sets: [makeSet('utility', utilityProps.map(c => c.id), true, false, houseCard.id)],
      });
      const { error } = applyAction(state, 'p1', {
        type: 'PLAY_HOTEL',
        cardId: hotelCard.id,
        setColor: 'utility',
      });
      expect(error).toBeDefined();
      expect(error).toMatch(/utility/i);
    });
  });
});

// ---------------------------------------------------------------------------
// JSN interaction tests (Milestone 4)
// ---------------------------------------------------------------------------

describe('JSN interaction', () => {
  const TWO_PLAYERS = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ];
  const THREE_PLAYERS = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Charlie' },
  ];

  const allCards = buildDeck();
  const cardMap: Record<string, Card> = {};
  for (const c of allCards) cardMap[c.id] = c;

  function allActions(action: ActionCard['action']): ActionCard[] {
    return allCards.filter(c => c.type === 'action' && (c as ActionCard).action === action) as ActionCard[];
  }
  function allPropertiesOfColor(color: Color): PropertyCard[] {
    return allCards.filter(c => c.type === 'property' && (c as PropertyCard).color === color) as PropertyCard[];
  }
  function allRents(wild?: boolean): RentCard[] {
    return allCards.filter(c => c.type === 'rent' && (wild === undefined || (c as RentCard).isWild === wild)) as RentCard[];
  }

  function makeSet(color: Color, cards: string[], hasHouse = false, hasHotel = false, houseCardId?: string, hotelCardId?: string): PropertySet {
    return { color, cards, hasHouse, hasHotel, houseCardId, hotelCardId };
  }

  function playingState(overrides?: {
    p1Hand?: string[];
    p2Hand?: string[];
    p3Hand?: string[];
    p1Bank?: string[];
    p2Bank?: string[];
    p1Sets?: PropertySet[];
    p2Sets?: PropertySet[];
    p3Sets?: PropertySet[];
    players?: { id: string; name: string }[];
    playsRemaining?: number;
  }): GameState {
    const playerDefs = overrides?.players ?? TWO_PLAYERS;
    const state = createGame(playerDefs, 42);
    const baseState: GameState = {
      ...state,
      phase: 'PLAYING',
      playsRemaining: overrides?.playsRemaining ?? 3,
      players: state.players.map(p => {
        const updates: Partial<PlayerState> = {};
        if (p.id === 'p1') {
          if (overrides?.p1Hand !== undefined) updates.hand = overrides.p1Hand;
          if (overrides?.p1Bank !== undefined) updates.bank = overrides.p1Bank;
          if (overrides?.p1Sets !== undefined) updates.propertySets = overrides.p1Sets;
        }
        if (p.id === 'p2') {
          if (overrides?.p2Hand !== undefined) updates.hand = overrides.p2Hand;
          if (overrides?.p2Bank !== undefined) updates.bank = overrides.p2Bank;
          if (overrides?.p2Sets !== undefined) updates.propertySets = overrides.p2Sets;
        }
        if (p.id === 'p3') {
          if (overrides?.p3Hand !== undefined) updates.hand = overrides.p3Hand;
          if (overrides?.p3Sets !== undefined) updates.propertySets = overrides.p3Sets;
        }
        return { ...p, ...updates };
      }),
    };
    return baseState;
  }

  // JSN Test 1: Playing a targeted action enters AWAITING_RESPONSES phase
  it('playing a targeted action enters AWAITING_RESPONSES phase', () => {
    const debtCard = allActions('debtCollector')[0]!;
    const state = playingState({ p1Hand: [debtCard.id] });
    const { state: s, error } = applyAction(state, 'p1', {
      type: 'PLAY_DEBT_COLLECTOR',
      cardId: debtCard.id,
      targetId: 'p2',
    });
    expect(error).toBeUndefined();
    expect(s.phase).toBe('AWAITING_RESPONSES');
    expect(s.pendingInteraction?.type).toBe('JSN_WINDOW');
    expect(s.pendingInteraction?.awaitingJsnFrom).toContain('p2');
    expect(s.pendingInteraction?.targetJsnStates).toHaveLength(1);
    expect(s.pendingInteraction?.targetJsnStates?.[0]?.targetId).toBe('p2');
    expect(s.pendingInteraction?.targetJsnStates?.[0]?.jsnCount).toBe(0);
  });

  // JSN Test 2: Target with no JSN can RESPOND_ALLOW and action proceeds
  it('target RESPOND_ALLOW with no JSN played makes action proceed', () => {
    const debtCard = allActions('debtCollector')[0]!;
    const state = playingState({ p1Hand: [debtCard.id] });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_DEBT_COLLECTOR',
      cardId: debtCard.id,
      targetId: 'p2',
    });
    const { state: s, error } = applyAction(jsn, 'p2', { type: 'RESPOND_ALLOW' });
    expect(error).toBeUndefined();
    expect(s.phase).toBe('AWAITING_PAYMENT');
    expect(s.pendingInteraction?.debts[0]?.debtorId).toBe('p2');
    expect(s.pendingInteraction?.debts[0]?.amountOwed).toBe(5);
  });

  // JSN Test 3: JSN cancels action for the player who played it
  it('JSN cancels the action for the target who played it', () => {
    const debtCard = allActions('debtCollector')[0]!;
    const jsnCard = allActions('justSayNo')[0]!;
    const state = playingState({
      p1Hand: [debtCard.id],
      p2Hand: [jsnCard.id],
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_DEBT_COLLECTOR',
      cardId: debtCard.id,
      targetId: 'p2',
    });
    // p2 plays JSN — now p1 must respond (counter or allow)
    const { state: afterJsn, error: e1 } = applyAction(jsn, 'p2', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: jsnCard.id,
    });
    expect(e1).toBeUndefined();
    expect(afterJsn.phase).toBe('AWAITING_RESPONSES');
    expect(afterJsn.pendingInteraction?.awaitingJsnFrom).toContain('p1'); // initiator can counter
    // p1 allows (declines to counter) → action cancelled
    const { state: s, error: e2 } = applyAction(afterJsn, 'p1', { type: 'RESPOND_ALLOW' });
    expect(e2).toBeUndefined();
    expect(s.phase).toBe('PLAYING'); // cancelled → back to PLAYING
    expect(s.pendingInteraction).toBeNull();
  });

  // JSN Test 4: Initiator counters target's JSN → action proceeds (even count = 2)
  it('initiator counter-JSN makes action proceed (even jsnCount)', () => {
    const debtCard = allActions('debtCollector')[0]!;
    const jsnCards = allActions('justSayNo');
    const p2Jsn = jsnCards[0]!;
    const p1Jsn = jsnCards[1]!;
    const state = playingState({
      p1Hand: [debtCard.id, p1Jsn.id],
      p2Hand: [p2Jsn.id],
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_DEBT_COLLECTOR',
      cardId: debtCard.id,
      targetId: 'p2',
    });
    // p2 plays JSN
    const { state: afterP2Jsn } = applyAction(jsn, 'p2', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: p2Jsn.id,
    });
    // p1 counters with JSN (jsnCount becomes 2 = even → action proceeds)
    const { state: afterP1Counter, error } = applyAction(afterP2Jsn, 'p1', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: p1Jsn.id,
    });
    expect(error).toBeUndefined();
    // Now p2 must respond again (allow or another JSN)
    expect(afterP1Counter.pendingInteraction?.awaitingJsnFrom).toContain('p2');
    // p2 allows → jsnCount is 2 (even) → action proceeds
    const { state: s } = applyAction(afterP1Counter, 'p2', { type: 'RESPOND_ALLOW' });
    expect(s.phase).toBe('AWAITING_PAYMENT');
    expect(s.pendingInteraction?.debts[0]?.debtorId).toBe('p2');
  });

  // JSN Test 5: Counter-counter (3 JSNs) → action cancelled (odd count)
  it('three JSN cards in chain → action cancelled (odd jsnCount)', () => {
    const debtCard = allActions('debtCollector')[0]!;
    const jsnCards = allActions('justSayNo');
    const p2Jsn1 = jsnCards[0]!;
    const p1Jsn = jsnCards[1]!;
    const p2Jsn2 = jsnCards[2]!;
    const state = playingState({
      p1Hand: [debtCard.id, p1Jsn.id],
      p2Hand: [p2Jsn1.id, p2Jsn2.id],
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_DEBT_COLLECTOR',
      cardId: debtCard.id,
      targetId: 'p2',
    });
    // p2 JSN #1
    const { state: s1 } = applyAction(jsn, 'p2', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: p2Jsn1.id,
    });
    // p1 counter JSN #2
    const { state: s2 } = applyAction(s1, 'p1', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: p1Jsn.id,
    });
    // p2 counter JSN #3
    const { state: s3 } = applyAction(s2, 'p2', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: p2Jsn2.id,
    });
    // Now p1 must respond; p1 allows → jsnCount is 3 (odd) → action cancelled
    const { state: s } = applyAction(s3, 'p1', { type: 'RESPOND_ALLOW' });
    expect(s.phase).toBe('PLAYING'); // cancelled
    expect(s.pendingInteraction).toBeNull();
  });

  // JSN Test 6: RESPOND_ALLOW from target (no JSN played) → action proceeds
  it('RESPOND_ALLOW from target with zero JSNs → action proceeds immediately', () => {
    const slyCard = allActions('slyDeal')[0]!;
    const yellowProp = allPropertiesOfColor('yellow')[0]!;
    const state = playingState({
      p1Hand: [slyCard.id],
      p2Sets: [makeSet('yellow', [yellowProp.id])],
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_SLY_DEAL',
      cardId: slyCard.id,
      targetId: 'p2',
      targetCardId: yellowProp.id,
    });
    const { state: s, error } = applyAction(jsn, 'p2', { type: 'RESPOND_ALLOW' });
    expect(error).toBeUndefined();
    expect(s.phase).toBe('PLAYING'); // steal happened, back to PLAYING
    const p1Yellow = s.players.find(p => p.id === 'p1')!.propertySets.find(ps => ps.color === 'yellow');
    expect(p1Yellow?.cards).toContain(yellowProp.id);
  });

  // JSN Test 7: Multi-target (Birthday): one player JSNs, other allows
  it('Birthday: player A JSNs → cancelled for A, B still owes', () => {
    const birthdayCard = allActions('birthday')[0]!;
    const jsnCard = allActions('justSayNo')[0]!;
    const state = playingState({
      players: THREE_PLAYERS,
      p1Hand: [birthdayCard.id],
      p2Hand: [jsnCard.id],
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_BIRTHDAY',
      cardId: birthdayCard.id,
    });
    expect(jsn.phase).toBe('AWAITING_RESPONSES');
    expect(jsn.pendingInteraction?.awaitingJsnFrom).toHaveLength(2); // p2 and p3

    // p2 plays JSN → p1 must respond
    const { state: afterP2Jsn } = applyAction(jsn, 'p2', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: jsnCard.id,
    });
    // p1 allows (p2's JSN stands → p2 action cancelled)
    const { state: afterP1Allow } = applyAction(afterP2Jsn, 'p1', { type: 'RESPOND_ALLOW' });
    // p3 still needs to respond
    expect(afterP1Allow.phase).toBe('AWAITING_RESPONSES');
    expect(afterP1Allow.pendingInteraction?.awaitingJsnFrom).toContain('p3');

    // p3 allows → action proceeds for p3 only
    const { state: s } = applyAction(afterP1Allow, 'p3', { type: 'RESPOND_ALLOW' });
    expect(s.phase).toBe('AWAITING_PAYMENT');
    // Only p3 owes (p2 cancelled)
    expect(s.pendingInteraction?.debts).toHaveLength(1);
    expect(s.pendingInteraction?.debts[0]?.debtorId).toBe('p3');
    expect(s.pendingInteraction?.debts[0]?.amountOwed).toBe(2);
  });

  // JSN Test 8: All players JSN → no payment for anyone
  it('Birthday: all players JSN → no payment, phase returns to PLAYING', () => {
    const birthdayCard = allActions('birthday')[0]!;
    const jsnCards = allActions('justSayNo');
    const p2Jsn = jsnCards[0]!;
    const p3Jsn = jsnCards[1]!;
    const state = playingState({
      players: THREE_PLAYERS,
      p1Hand: [birthdayCard.id],
      p2Hand: [p2Jsn.id],
      p3Hand: [p3Jsn.id],
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_BIRTHDAY',
      cardId: birthdayCard.id,
    });

    // p2 plays JSN
    const { state: s1 } = applyAction(jsn, 'p2', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: p2Jsn.id,
    });
    // p1 allows p2's JSN (p2 cancelled)
    const { state: s2 } = applyAction(s1, 'p1', { type: 'RESPOND_ALLOW' });

    // p3 plays JSN
    const { state: s3 } = applyAction(s2, 'p3', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: p3Jsn.id,
    });
    // p1 allows p3's JSN (p3 cancelled)
    const { state: s } = applyAction(s3, 'p1', { type: 'RESPOND_ALLOW' });

    expect(s.phase).toBe('PLAYING'); // no debts → back to PLAYING
    expect(s.pendingInteraction).toBeNull();
  });

  // JSN Test 9: Multi-target: player JSNs and initiator counters → back to awaiting target
  it('Birthday: p2 JSNs, p1 counters → back to awaiting p2', () => {
    const birthdayCard = allActions('birthday')[0]!;
    const jsnCards = allActions('justSayNo');
    const p2Jsn = jsnCards[0]!;
    const p1Jsn = jsnCards[1]!;
    const state = playingState({
      players: THREE_PLAYERS,
      p1Hand: [birthdayCard.id, p1Jsn.id],
      p2Hand: [p2Jsn.id],
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_BIRTHDAY',
      cardId: birthdayCard.id,
    });

    // p2 plays JSN
    const { state: s1 } = applyAction(jsn, 'p2', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: p2Jsn.id,
    });
    // p1 counters for p2's chain
    const { state: s2, error } = applyAction(s1, 'p1', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: p1Jsn.id,
    });
    expect(error).toBeUndefined();
    // p2 is back in awaiting list (can counter again or allow)
    expect(s2.pendingInteraction?.awaitingJsnFrom).toContain('p2');
    // p3 is still in awaiting list
    expect(s2.pendingInteraction?.awaitingJsnFrom).toContain('p3');
  });

  // JSN Test 10: JSN doesn't consume plays (playsRemaining unchanged)
  it('RESPOND_JUST_SAY_NO does not decrement playsRemaining', () => {
    const debtCard = allActions('debtCollector')[0]!;
    const jsnCard = allActions('justSayNo')[0]!;
    const state = playingState({
      p1Hand: [debtCard.id],
      p2Hand: [jsnCard.id],
      playsRemaining: 3,
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_DEBT_COLLECTOR',
      cardId: debtCard.id,
      targetId: 'p2',
    });
    // playsRemaining decremented when DC card is played (3 - 1 = 2)
    expect(jsn.playsRemaining).toBe(2);

    const { state: afterJsn } = applyAction(jsn, 'p2', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: jsnCard.id,
    });
    // playsRemaining should NOT change when JSN is played
    expect(afterJsn.playsRemaining).toBe(2);
  });

  // JSN Test 11: JSN card moves from hand to discard when played
  it('JSN card is removed from hand and added to discard', () => {
    const debtCard = allActions('debtCollector')[0]!;
    const jsnCard = allActions('justSayNo')[0]!;
    const state = playingState({
      p1Hand: [debtCard.id],
      p2Hand: [jsnCard.id],
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_DEBT_COLLECTOR',
      cardId: debtCard.id,
      targetId: 'p2',
    });
    expect(jsn.players.find(p => p.id === 'p2')!.hand).toContain(jsnCard.id);

    const { state: s } = applyAction(jsn, 'p2', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: jsnCard.id,
    });
    // JSN card removed from p2's hand
    expect(s.players.find(p => p.id === 'p2')!.hand).not.toContain(jsnCard.id);
    // JSN card added to discard
    expect(s.discard).toContain(jsnCard.id);
  });

  // JSN Test 12: After JSN cancels Sly Deal → no steal, phase returns to PLAYING
  it('JSN cancels Sly Deal → no steal happens, phase returns to PLAYING', () => {
    const slyCard = allActions('slyDeal')[0]!;
    const jsnCard = allActions('justSayNo')[0]!;
    const yellowProp = allPropertiesOfColor('yellow')[0]!;
    const state = playingState({
      p1Hand: [slyCard.id],
      p2Hand: [jsnCard.id],
      p2Sets: [makeSet('yellow', [yellowProp.id])],
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_SLY_DEAL',
      cardId: slyCard.id,
      targetId: 'p2',
      targetCardId: yellowProp.id,
    });
    // p2 JSNs
    const { state: afterJsn } = applyAction(jsn, 'p2', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: jsnCard.id,
    });
    // p1 allows → JSN stands → steal cancelled
    const { state: s } = applyAction(afterJsn, 'p1', { type: 'RESPOND_ALLOW' });
    expect(s.phase).toBe('PLAYING');
    expect(s.pendingInteraction).toBeNull();
    // Property still belongs to p2
    const p2Yellow = s.players.find(p => p.id === 'p2')!.propertySets.find(ps => ps.color === 'yellow');
    expect(p2Yellow?.cards).toContain(yellowProp.id);
    // p1 doesn't have it
    const p1Yellow = s.players.find(p => p.id === 'p1')!.propertySets.find(ps => ps.color === 'yellow');
    expect(p1Yellow?.cards ?? []).not.toContain(yellowProp.id);
  });

  // JSN Test 13: After RESPOND_ALLOW on Sly Deal → steal executes immediately
  it('RESPOND_ALLOW on Sly Deal → steal executes, no AWAITING_PAYMENT phase', () => {
    const slyCard = allActions('slyDeal')[0]!;
    const yellowProp = allPropertiesOfColor('yellow')[0]!;
    const state = playingState({
      p1Hand: [slyCard.id],
      p2Sets: [makeSet('yellow', [yellowProp.id])],
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_SLY_DEAL',
      cardId: slyCard.id,
      targetId: 'p2',
      targetCardId: yellowProp.id,
    });
    const { state: s, error } = applyAction(jsn, 'p2', { type: 'RESPOND_ALLOW' });
    expect(error).toBeUndefined();
    expect(s.phase).toBe('PLAYING'); // immediate execution, no payment phase
    const p1Yellow = s.players.find(p => p.id === 'p1')!.propertySets.find(ps => ps.color === 'yellow');
    expect(p1Yellow?.cards).toContain(yellowProp.id);
  });

  // JSN Test 14: After JSN cancels Deal Breaker → no steal happens
  it('JSN cancels Deal Breaker → target keeps their complete set', () => {
    const dealBreakerCard = allActions('dealBreaker')[0]!;
    const jsnCard = allActions('justSayNo')[0]!;
    const yellowProps = allPropertiesOfColor('yellow');
    const state = playingState({
      p1Hand: [dealBreakerCard.id],
      p2Hand: [jsnCard.id],
      p2Sets: [makeSet('yellow', yellowProps.map(c => c.id))],
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_DEAL_BREAKER',
      cardId: dealBreakerCard.id,
      targetId: 'p2',
      setColor: 'yellow',
    });
    // p2 JSNs
    const { state: afterJsn } = applyAction(jsn, 'p2', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: jsnCard.id,
    });
    // p1 allows → JSN stands → steal cancelled
    const { state: s } = applyAction(afterJsn, 'p1', { type: 'RESPOND_ALLOW' });
    expect(s.phase).toBe('PLAYING');
    // p2 still has the yellow set
    const p2Yellow = s.players.find(p => p.id === 'p2')!.propertySets.find(ps => ps.color === 'yellow');
    expect(p2Yellow?.cards).toHaveLength(yellowProps.length);
    // p1 doesn't have it
    const p1Yellow = s.players.find(p => p.id === 'p1')!.propertySets.find(ps => ps.color === 'yellow');
    expect(p1Yellow).toBeUndefined();
  });

  // JSN Test 15: Debt Collector JSN'd → no payment for the target
  it('Debt Collector JSN\'d → no payment', () => {
    const debtCard = allActions('debtCollector')[0]!;
    const jsnCard = allActions('justSayNo')[0]!;
    const state = playingState({
      p1Hand: [debtCard.id],
      p2Hand: [jsnCard.id],
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_DEBT_COLLECTOR',
      cardId: debtCard.id,
      targetId: 'p2',
    });
    const { state: afterJsn } = applyAction(jsn, 'p2', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: jsnCard.id,
    });
    const { state: s } = applyAction(afterJsn, 'p1', { type: 'RESPOND_ALLOW' });
    expect(s.phase).toBe('PLAYING');
    expect(s.pendingInteraction).toBeNull();
    // p2 paid nothing
    expect(s.players.find(p => p.id === 'p1')!.bank).toHaveLength(0);
  });

  // JSN Test 16: Rent JSN cancelled for one target, other still pays
  it('Rent JSN cancelled for one target, non-cancelled target still pays', () => {
    const greenProps = allPropertiesOfColor('green');
    const rentCard = allRents(false).find(r => r.colors.includes('green'))!;
    const jsnCard = allActions('justSayNo')[0]!;

    const state = playingState({
      players: THREE_PLAYERS,
      p1Hand: [rentCard.id],
      p1Sets: [makeSet('green', [greenProps[0]!.id])],
      p2Hand: [jsnCard.id],
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_RENT',
      cardId: rentCard.id,
      chosenColor: 'green',
    });
    expect(jsn.phase).toBe('AWAITING_RESPONSES');
    expect(jsn.pendingInteraction?.awaitingJsnFrom).toHaveLength(2); // p2 and p3

    // p2 JSNs
    const { state: s1 } = applyAction(jsn, 'p2', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: jsnCard.id,
    });
    // p1 allows p2's JSN → p2 cancelled
    const { state: s2 } = applyAction(s1, 'p1', { type: 'RESPOND_ALLOW' });

    // p3 allows → p3 owes rent
    const { state: s } = applyAction(s2, 'p3', { type: 'RESPOND_ALLOW' });
    expect(s.phase).toBe('AWAITING_PAYMENT');
    // Only p3 owes
    expect(s.pendingInteraction?.debts).toHaveLength(1);
    expect(s.pendingInteraction?.debts[0]?.debtorId).toBe('p3');
    expect(s.pendingInteraction?.debts[0]?.amountOwed).toBe(RENT_LADDERS['green'][0]!); // $2M
  });

  // JSN Test extra: getRedactedView shows respondJSN for awaiting targets
  it('getRedactedView shows respondJSN for players in awaitingJsnFrom', () => {
    const debtCard = allActions('debtCollector')[0]!;
    const state = playingState({ p1Hand: [debtCard.id] });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_DEBT_COLLECTOR',
      cardId: debtCard.id,
      targetId: 'p2',
    });
    const view = getRedactedView(jsn, 'p2');
    expect(view.yourPendingDecision?.type).toBe('respondJSN');
    // p1 does not have a pending decision yet (waiting for p2)
    const viewP1 = getRedactedView(jsn, 'p1');
    expect(viewP1.yourPendingDecision).toBeNull();
  });

  // JSN Test extra: getRedactedView shows respondJSN for initiator when counter-JSN needed
  it('getRedactedView shows respondJSN for initiator when target played JSN', () => {
    const debtCard = allActions('debtCollector')[0]!;
    const jsnCard = allActions('justSayNo')[0]!;
    const state = playingState({
      p1Hand: [debtCard.id],
      p2Hand: [jsnCard.id],
    });
    const { state: jsn } = applyAction(state, 'p1', {
      type: 'PLAY_DEBT_COLLECTOR',
      cardId: debtCard.id,
      targetId: 'p2',
    });
    const { state: afterJsn } = applyAction(jsn, 'p2', {
      type: 'RESPOND_JUST_SAY_NO',
      cardId: jsnCard.id,
    });
    // Now p1 is in awaitingJsnFrom
    const view = getRedactedView(afterJsn, 'p1');
    expect(view.yourPendingDecision?.type).toBe('respondJSN');
  });
});
