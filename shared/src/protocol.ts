import type { Color } from './cards.js';
import type { RedactedGameView } from './state.js';

// ---------------------------------------------------------------------------
// Room State
// ---------------------------------------------------------------------------

export interface RoomPlayer {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
}

export interface RoomState {
  roomCode: string;
  hostId: string;
  players: RoomPlayer[];
  gameStarted: boolean;
}

// ---------------------------------------------------------------------------
// Scoreboard
// ---------------------------------------------------------------------------

export interface ScoreEntry {
  playerId: string;
  playerName: string;
  completeSets: number;
  bankTotal: number;
  wins?: number;
}

// ---------------------------------------------------------------------------
// Game Actions (Client → Server via game:action)
// ---------------------------------------------------------------------------

/** Play a card from hand to the table (property, action) or bank */
export interface PlayCardAction {
  type: 'playCard';
  cardId: string;
  /** Where to play: 'property' | 'bank' | an existing set color to add a wildcard */
  destination: 'property' | 'bank' | Color;
}

/** Rearrange a wildcard from one property set to another */
export interface MoveWildcardAction {
  type: 'moveWildcard';
  cardId: string;
  fromColor: Color;
  toColor: Color;
}

/** End the current player's turn (triggers discard if needed) */
export interface EndTurnAction {
  type: 'endTurn';
}

/** Respond to a pending Just Say No opportunity */
export interface JustSayNoResponseAction {
  type: 'justSayNoResponse';
  play: boolean; // true = play JSN card, false = accept the action
  cardId?: string; // required when play === true
}

/** Pay rent / birthday / debt collector */
export interface PaymentResponseAction {
  type: 'paymentResponse';
  /** Card IDs from hand/bank/property to use as payment */
  cardIds: string[];
}

/** Sly Deal – choose a property to steal (active player selects) */
export interface SlyDealSelectAction {
  type: 'slyDealSelect';
  targetPlayerId: string;
  cardId: string;
}

/** Forced Deal – swap one of your properties for a target's */
export interface ForcedDealSelectAction {
  type: 'forcedDealSelect';
  targetPlayerId: string;
  theirCardId: string;
  myCardId: string;
}

/** Deal Breaker – steal a complete property set */
export interface DealBreakerSelectAction {
  type: 'dealBreakerSelect';
  targetPlayerId: string;
  setColor: Color;
}

/** Discard a card from hand (during discard phase) */
export interface DiscardAction {
  type: 'discard';
  cardId: string;
}

// ---------------------------------------------------------------------------
// Engine-native action types (used by the pure game engine in Milestone 2+)
// ---------------------------------------------------------------------------

/** Draw cards to start your turn */
export interface StartTurnAction {
  type: 'START_TURN';
}

/** Play a money card (or rent/action card) to your bank */
export interface PlayMoneyAction {
  type: 'PLAY_MONEY';
  cardId: string;
}

/** Play a property or wildcard card to a property set */
export interface PlayPropertyAction {
  type: 'PLAY_PROPERTY';
  cardId: string;
  /** Which color set to place the card in */
  setColor: Color;
}

/** Move a wildcard already on the table to a different color set (free action) */
export interface MoveWildcardEngineAction {
  type: 'MOVE_WILDCARD';
  cardId: string;
  fromSetColor: Color;
  toSetColor: Color;
}

/** Play a Pass Go action card to draw 2 extra cards */
export interface PlayPassGoAction {
  type: 'PLAY_PASS_GO';
  cardId: string;
}

/** End your turn */
export interface EndTurnEngineAction {
  type: 'END_TURN';
}

/** Discard one or more cards when hand exceeds 7 */
export interface DiscardEngineAction {
  type: 'DISCARD';
  cardIds: string[];
}

/** Play a rent card, charging opponents */
export interface PlayRentAction {
  type: 'PLAY_RENT';
  cardId: string;           // the rent card
  chosenColor: Color;       // which color to charge rent for
  targetId?: string;        // required for wild rent (single target)
  doubleCardIds?: string[]; // optional Double the Rent card IDs to play simultaneously
}

/** Play Debt Collector — charge a single opponent $5M */
export interface PlayDebtCollectorAction {
  type: 'PLAY_DEBT_COLLECTOR';
  cardId: string;
  targetId: string;
}

/** Play It's My Birthday — charge all opponents $2M each */
export interface PlayBirthdayAction {
  type: 'PLAY_BIRTHDAY';
  cardId: string;
}

/** Play Sly Deal — steal one property from an incomplete set */
export interface PlaySlyDealAction {
  type: 'PLAY_SLY_DEAL';
  cardId: string;
  targetId: string;
  targetCardId: string; // the property card to steal
}

/** Play Forced Deal — swap one of your properties for a target's */
export interface PlayForcedDealAction {
  type: 'PLAY_FORCED_DEAL';
  cardId: string;
  targetId: string;
  targetCardId: string; // which of target's properties to take
  myCardId: string;     // which of your properties to give
}

/** Play Deal Breaker — steal a complete property set */
export interface PlayDealBreakerAction {
  type: 'PLAY_DEAL_BREAKER';
  cardId: string;
  targetId: string;
  setColor: Color; // which complete set to steal
}

/** Play House — add a house to a complete set */
export interface PlayHouseAction {
  type: 'PLAY_HOUSE';
  cardId: string;
  setColor: Color; // which complete set to add the house to
}

/** Play Hotel — add a hotel to a set that already has a house */
export interface PlayHotelAction {
  type: 'PLAY_HOTEL';
  cardId: string;
  setColor: Color; // which complete set to add the hotel to
}

/** Pay a debt (in AWAITING_PAYMENT phase) */
export interface PayAction {
  type: 'PAY';
  cardIds: string[]; // cards from bank/property the paying player selects
}

/** Play Just Say No to block an action against you */
export interface RespondJustSayNoAction {
  type: 'RESPOND_JUST_SAY_NO';
  cardId: string; // the JSN card being played
}

/** Decline to play Just Say No — let the action proceed */
export interface RespondAllowAction {
  type: 'RESPOND_ALLOW';
}

export type GameAction =
  | PlayCardAction
  | MoveWildcardAction
  | EndTurnAction
  | JustSayNoResponseAction
  | PaymentResponseAction
  | SlyDealSelectAction
  | ForcedDealSelectAction
  | DealBreakerSelectAction
  | DiscardAction
  // Engine-native actions
  | StartTurnAction
  | PlayMoneyAction
  | PlayPropertyAction
  | MoveWildcardEngineAction
  | PlayPassGoAction
  | EndTurnEngineAction
  | DiscardEngineAction
  | PlayRentAction
  | PlayDebtCollectorAction
  | PlayBirthdayAction
  | PlaySlyDealAction
  | PlayForcedDealAction
  | PlayDealBreakerAction
  | PlayHouseAction
  | PlayHotelAction
  | PayAction
  | RespondJustSayNoAction
  | RespondAllowAction;

// ---------------------------------------------------------------------------
// Socket.IO Event Maps
// ---------------------------------------------------------------------------

/** Events emitted by the Client, received by the Server */
export interface ClientEvents {
  'room:create': (
    payload: { name: string },
    cb: (res: { roomCode: string; playerId: string } | { error: string }) => void
  ) => void;

  'room:join': (
    payload: { roomCode: string; name: string },
    cb: (res: { playerId: string } | { error: string }) => void
  ) => void;

  'room:leave': () => void;

  'game:start': () => void;

  'game:action': (payload: { action: GameAction }) => void;

  'chat:message': (payload: { text: string }) => void;
}

/** Events emitted by the Server, received by the Client */
export interface ServerEvents {
  'room:state': (payload: RoomState) => void;

  'game:view': (payload: { view: RedactedGameView }) => void;

  'game:event': (payload: { message: string; ts: number }) => void;

  'game:over': (payload: { winnerId: string; scoreboard: ScoreEntry[] }) => void;

  'chat:message': (payload: {
    playerId: string;
    playerName: string;
    text: string;
    ts: number;
  }) => void;

  'error': (payload: { code: string; message: string }) => void;
}
