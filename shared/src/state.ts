import type { Card, Color } from './cards.js';
import type { GameAction } from './protocol.js';

// ---------------------------------------------------------------------------
// Property Sets
// ---------------------------------------------------------------------------

export interface PropertySet {
  color: Color;
  /** Card IDs of property cards (and wildcards) in this set */
  cards: string[];
  hasHouse: boolean;
  hasHotel: boolean;
  /** Card ID of the House card placed on this set (if any) */
  houseCardId?: string;
  /** Card ID of the Hotel card placed on this set (if any) */
  hotelCardId?: string;
}

// ---------------------------------------------------------------------------
// Player State
// ---------------------------------------------------------------------------

export interface PlayerState {
  id: string;
  name: string;
  /** Card IDs in hand */
  hand: string[];
  /** Card IDs banked (money / cards played face-down) */
  bank: string[];
  propertySets: PropertySet[];
  connected: boolean;
}

// ---------------------------------------------------------------------------
// Pending Interactions (payment, JSN windows, etc.)
// ---------------------------------------------------------------------------

export type PendingInteractionType =
  | 'PAYMENT'       // one or more players owe money
  | 'JSN_WINDOW';   // waiting for JSN responses before action resolves

export interface PaymentDebt {
  debtorId: string;
  amountOwed: number;
  paid: boolean;
  cardsPaid: string[]; // card IDs actually paid
}

/**
 * Tracks the JSN volley state for a single target in a JSN_WINDOW.
 * jsnCount is the total number of JSN cards played in this chain.
 * Even count → action proceeds; Odd count → action cancelled for this target.
 */
export interface TargetJsnState {
  targetId: string;
  /** Total JSN cards played in this chain so far */
  jsnCount: number;
  /** Whose turn it is to respond in the volley */
  awaitingFrom: 'target' | 'initiator';
  /** Whether this target's chain is fully resolved */
  resolved: boolean;
  /** Whether the action is cancelled for this target (odd jsnCount when resolved) */
  cancelled: boolean;
}

export interface PendingInteraction {
  type: PendingInteractionType;
  /** Player who initiated the action */
  initiatorId: string;

  // For PAYMENT:
  /** Who receives the money */
  recipientId: string;
  /** Each debtor's obligation (usually 1 player, Birthday = multiple) */
  debts: PaymentDebt[];

  // For JSN_WINDOW:
  /** The action waiting to be confirmed/cancelled */
  pendingAction?: GameAction;
  /** Player IDs who played JSN in order (parity determines outcome) */
  jsnChain: string[];
  /** Players who still need to respond (JSN or Allow) */
  awaitingJsnFrom?: string[];
  /** Per-target JSN chain state (one entry per target) */
  targetJsnStates?: TargetJsnState[];

  expiresAt?: number;
}

// ---------------------------------------------------------------------------
// Pending Decision (what THIS player must do right now — for redacted view)
// ---------------------------------------------------------------------------

export type PendingDecisionType =
  | 'drawCards'     // must call START_TURN
  | 'playOrEnd'     // playing phase — can play cards or end turn
  | 'discard'       // must discard down to 7
  | 'respondJSN'    // may play Just Say No
  | 'pay';          // must submit payment

export interface PendingDecision {
  type: PendingDecisionType;
}

// ---------------------------------------------------------------------------
// Game Phase
// ---------------------------------------------------------------------------

export type GamePhase =
  | 'WAITING'              // lobby – game not started
  | 'AWAITING_TURN_START'  // current player must draw
  | 'PLAYING'              // current player is playing cards (playsRemaining > 0)
  | 'AWAITING_DISCARD'     // current player must discard down to 7
  | 'AWAITING_RESPONSES'   // waiting for a non-active player (JSN window)
  | 'AWAITING_PAYMENT'     // someone must pay rent/birthday/debt
  | 'FINISHED';            // game over

// ---------------------------------------------------------------------------
// Action Log Entry
// ---------------------------------------------------------------------------

export type ActionLogEntry = string;

// ---------------------------------------------------------------------------
// Full Authoritative Game State (server-side)
// ---------------------------------------------------------------------------

export interface GameState {
  /** Unique identifier for this game instance */
  gameId: string;
  /** Unique identifier for this round */
  roundId: string;
  /** Ordered list of all player states */
  players: PlayerState[];
  /** Index into players array for the current player */
  currentPlayerIndex: number;
  /** Current game phase */
  phase: GamePhase;
  /** How many card plays the current player has remaining this turn */
  playsRemaining: number;
  /** Card IDs remaining in the draw pile (top = last element) */
  deck: string[];
  /** Card IDs in the discard pile (top = last element) */
  discard: string[];
  /** id → Card lookup; contains all 106 cards for this game */
  cardMap: Record<string, Card>;
  /** If non-null, the game is waiting on a player response */
  pendingInteraction: PendingInteraction | null;
  /** Human-readable log of game events */
  actionLog: ActionLogEntry[];
  /** Seed for deterministic RNG (mulberry32) */
  rngSeed: number;
  /** ID of the winning player, or null if game is still in progress */
  winnerId: string | null;
}

// ---------------------------------------------------------------------------
// Redacted Views (sent to clients)
// ---------------------------------------------------------------------------

/** Another player's state as seen by an observer (hand is just a count) */
export interface RedactedPlayerView {
  id: string;
  name: string;
  isCurrentPlayer: boolean;
  /** Number of cards in hand (not the actual card IDs) */
  handCount: number;
  /** The requesting player's own hand (cards), only set for self */
  hand?: Card[];
  bank: Card[];
  propertySets: PropertySet[];
  connected: boolean;
}

/** The full game view sent to a specific player */
export interface RedactedGameView {
  gameId: string;
  phase: GamePhase;
  myPlayerId: string;
  players: RedactedPlayerView[];
  currentPlayerIndex: number;
  playsRemaining: number;
  /** Number of cards left in the draw pile */
  deck: { count: number };
  /** Top card of the discard pile (if any) */
  discardTop: Card | null;
  pendingInteraction: PendingInteraction | null;
  actionLog: ActionLogEntry[];
  winnerId: string | null;
  /** What this player must do right now (null if it's not their decision) */
  yourPendingDecision: PendingDecision | null;
}
