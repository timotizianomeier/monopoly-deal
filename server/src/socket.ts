/**
 * Socket.IO event handlers — the heart of the server.
 *
 * Design notes
 * ────────────
 * • Per-player views are ALWAYS sent individually via io.to(socketId), never
 *   broadcast to the whole room.
 * • playerId is stored in socket.data after room:create / room:join.
 * • Reconnection: room:join accepts an optional playerId field. If it matches
 *   an existing seat in an in-progress game, we rebind that seat to the new
 *   socket instead of creating a new player.
 * • Interaction timeouts (30 s): when the engine enters AWAITING_RESPONSES or
 *   AWAITING_PAYMENT, we set a per-room timeout. The timeout is cleared when
 *   the interaction resolves naturally (next successful applyAction call).
 */

import type { Server, Socket } from 'socket.io';
import type { ClientEvents, ServerEvents, GameAction, ScoreEntry, Card, PlayerState } from '@monopoly-deal/shared';
import type { GameState } from '@monopoly-deal/shared';
import { INTERACTION_TIMEOUT_SECONDS } from '@monopoly-deal/shared';
import {
  createRoom,
  joinRoom,
  getRoomByCode,
  getRoomByPlayerId,
  reconnectPlayer,
  disconnectPlayer,
  removePlayerFromLobby,
  generatePlayerId,
  generateMatchId,
  type Room,
} from './rooms.js';
import {
  recordRoundStart,
  recordRoundEnd,
  getMatchScoreboard,
} from './db.js';
import { createGame, applyAction, getRedactedView } from './engine/engine.js';
import type { RoomState } from '@monopoly-deal/shared';

// ---------------------------------------------------------------------------
// Timeout bookkeeping
// ---------------------------------------------------------------------------

/** roomCode → NodeJS.Timeout handle for the pending-interaction timer */
const interactionTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the RoomState payload that goes to ALL players in the room
 * (lobby-level information only — no hand / card details).
 */
function buildRoomState(room: Room): RoomState {
  return {
    roomCode: room.code,
    hostId: room.hostId,
    players: Array.from(room.players.values()),
    gameStarted: room.gameState !== null,
  };
}

/**
 * Send an individualised, redacted game view to every connected player.
 */
function broadcastGameViews(io: Server<ClientEvents, ServerEvents>, room: Room): void {
  if (!room.gameState) return;
  for (const [playerId, socketId] of room.socketMap) {
    const view = getRedactedView(room.gameState, playerId);
    io.to(socketId).emit('game:view', { view });
  }
}

/**
 * Emit `room:state` to the entire Socket.IO room (all sockets in the room channel).
 */
function broadcastRoomState(io: Server<ClientEvents, ServerEvents>, room: Room): void {
  io.to(room.code).emit('room:state', buildRoomState(room));
}

/**
 * Emit an error payload back to one socket.
 */
function sendError(
  socket: Socket<ClientEvents, ServerEvents>,
  code: string,
  message: string
): void {
  socket.emit('error', { code, message });
}

// ---------------------------------------------------------------------------
// Interaction timeout handling
// ---------------------------------------------------------------------------

const INTERACTION_TIMEOUT_MS = INTERACTION_TIMEOUT_SECONDS * 1000;

/**
 * Schedule an auto-resolution for the current pending interaction.
 * Clears any previously scheduled timer for this room.
 */
function scheduleInteractionTimeout(
  io: Server<ClientEvents, ServerEvents>,
  room: Room
): void {
  clearInteractionTimeout(room.code);

  const code = room.code;
  const phase = room.gameState?.phase;

  if (phase !== 'AWAITING_RESPONSES' && phase !== 'AWAITING_PAYMENT') return;

  // Stamp the deadline on the interaction so clients can show a countdown.
  if (room.gameState?.pendingInteraction) {
    room.gameState = {
      ...room.gameState,
      pendingInteraction: {
        ...room.gameState.pendingInteraction,
        expiresAt: Date.now() + INTERACTION_TIMEOUT_MS,
      },
    };
  }

  const timer = setTimeout(() => {
    interactionTimers.delete(code);
    const currentRoom = getRoomByCode(code);
    if (!currentRoom?.gameState) return;

    const state = currentRoom.gameState;

    if (state.phase === 'AWAITING_RESPONSES') {
      // Auto-allow for every player still awaiting a JSN decision
      const waiting = state.pendingInteraction?.awaitingJsnFrom ?? [];
      let current = state;
      for (const pid of waiting) {
        const result = applyAction(current, pid, { type: 'RESPOND_ALLOW' });
        if (!result.error) current = result.state;
      }
      currentRoom.gameState = current;
      finishTimeoutStep(io, currentRoom, current);
    } else if (state.phase === 'AWAITING_PAYMENT') {
      // Auto-pay for every debtor with the cheapest sufficient selection
      const debts = state.pendingInteraction?.debts ?? [];
      let current = state;
      for (const debt of debts) {
        if (debt.paid) continue;
        const debtor = current.players.find(p => p.id === debt.debtorId);
        if (!debtor) continue;

        const cardIds = chooseAutoPayment(debtor, debt.amountOwed, current.cardMap);
        const result = applyAction(current, debt.debtorId, { type: 'PAY', cardIds });
        if (!result.error) {
          current = result.state;
        } else {
          console.warn(`[${code}] auto-pay failed for ${debtor.name}: ${result.error}`);
        }
      }
      currentRoom.gameState = current;
      finishTimeoutStep(io, currentRoom, current);
    }
  }, INTERACTION_TIMEOUT_MS);

  interactionTimers.set(code, timer);
}

/** After a timeout auto-resolution: re-arm the timer if still waiting, then broadcast. */
function finishTimeoutStep(
  io: Server<ClientEvents, ServerEvents>,
  room: Room,
  state: GameState
): void {
  if (!state.winnerId && (state.phase === 'AWAITING_RESPONSES' || state.phase === 'AWAITING_PAYMENT')) {
    scheduleInteractionTimeout(io, room);
  }
  broadcastGameViews(io, room);
  broadcastRoomState(io, room);
  if (state.winnerId) handleGameOver(io, room, state);
}

/**
 * Pick cards for an automatic payment (used when a debtor does not respond).
 * Priority: bank cards, then House/Hotel cards, then property cards. Within
 * the bank the cheapest sufficient combination is preferred so the player is
 * not stripped of everything because they were slow. Multi-color wildcards
 * ($0) are never used. If total assets are below the debt, everything usable
 * is paid (official rule).
 */
export function chooseAutoPayment(
  debtor: PlayerState,
  amount: number,
  cardMap: Record<string, Card>
): string[] {
  const value = (id: string): number => {
    const c = cardMap[id];
    if (!c) return 0;
    if (c.type === 'wildcard' && c.isMultiColor) return 0;
    return c.bankValue;
  };
  const usable = (id: string): boolean => {
    const c = cardMap[id];
    return !!c && !(c.type === 'wildcard' && c.isMultiColor);
  };
  const byValue = (a: string, b: string) => value(a) - value(b);

  const bank = debtor.bank.filter(usable).sort(byValue);
  const buildings = debtor.propertySets
    .flatMap(s => [s.houseCardId, s.hotelCardId])
    .filter((id): id is string => !!id && usable(id))
    .sort(byValue);
  const properties = debtor.propertySets
    .flatMap(s => s.cards)
    .filter(usable)
    .sort(byValue);

  const total = [...bank, ...buildings, ...properties].reduce((sum, id) => sum + value(id), 0);
  if (total <= amount) return [...bank, ...buildings, ...properties];

  // Option A: greedy ascending through bank → buildings → properties
  const greedy: string[] = [];
  let sum = 0;
  for (const id of [...bank, ...buildings, ...properties]) {
    if (sum >= amount) break;
    greedy.push(id);
    sum += value(id);
  }
  // Option B: the single cheapest bank card that covers the debt on its own
  const single = bank.find(id => value(id) >= amount);
  if (single && value(single) <= sum) return [single];
  return greedy;
}

function clearInteractionTimeout(roomCode: string): void {
  const existing = interactionTimers.get(roomCode);
  if (existing !== undefined) {
    clearTimeout(existing);
    interactionTimers.delete(roomCode);
  }
}

// ---------------------------------------------------------------------------
// Game-over handling
// ---------------------------------------------------------------------------

function handleGameOver(
  io: Server<ClientEvents, ServerEvents>,
  room: Room,
  state: GameState
): void {
  if (!state.winnerId) return;

  clearInteractionTimeout(room.code);

  // Record in DB
  if (state.roundId) {
    recordRoundEnd(state.roundId, state.winnerId);
  }

  // Merge DB wins with live game state for this round's final positions
  const dbScoreboard = getMatchScoreboard(room.code);
  const winsMap = new Map(dbScoreboard.map(row => [row.playerId, row.wins]));
  const scoreboard: ScoreEntry[] = state.players.map(p => ({
    playerId: p.id,
    playerName: p.name,
    completeSets: p.propertySets.filter(s => s.cards.length > 0).length,
    bankTotal: p.bank.length,
    wins: winsMap.get(p.id) ?? 0,
  }));

  io.to(room.code).emit('game:over', { winnerId: state.winnerId, scoreboard });

  const winner = state.players.find(p => p.id === state.winnerId);
  console.log(`[${room.code}] Game over — winner: ${winner?.name ?? state.winnerId}`);
}

// ---------------------------------------------------------------------------
// Main setup
// ---------------------------------------------------------------------------

export function setupSocketHandlers(io: Server<ClientEvents, ServerEvents>): void {
  io.on('connection', (socket) => {
    console.log(`[socket] connected ${socket.id}`);

    // ------------------------------------------------------------------
    // room:create
    // ------------------------------------------------------------------
    socket.on('room:create', ({ name }, cb) => {
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return cb({ error: 'Name must not be empty' });
      }
      const trimmedName = name.trim().slice(0, 20);
      const playerId = generatePlayerId();
      const room = createRoom(playerId, trimmedName);

      socket.data.playerId = playerId;
      socket.join(room.code);
      room.socketMap.set(playerId, socket.id);

      console.log(`[${room.code}] created by ${trimmedName}`);
      broadcastRoomState(io, room);
      cb({ roomCode: room.code, playerId });
    });

    // ------------------------------------------------------------------
    // room:join
    // ------------------------------------------------------------------
    socket.on('room:join', (payload, cb) => {
      const { roomCode, name } = payload as { roomCode: string; name: string; playerId?: string };
      const providedPlayerId: string | undefined = (payload as any).playerId;

      if (!roomCode || typeof roomCode !== 'string') {
        return cb({ error: 'Room code is required' });
      }
      const upperCode = roomCode.toUpperCase();
      const room = getRoomByCode(upperCode);
      if (!room) return cb({ error: 'Room not found' });

      // ── Reconnection path (checked BEFORE name validation) ────────────
      // A client that reloads the page only has its stored playerId + room
      // code; it must be able to resume its seat without retyping a name.
      if (providedPlayerId && room.players.has(providedPlayerId)) {
        const existing = room.players.get(providedPlayerId)!;
        reconnectPlayer(upperCode, providedPlayerId, socket.id);
        socket.data.playerId = providedPlayerId;
        socket.join(upperCode);

        console.log(`[${upperCode}] ${existing.name} reconnected`);
        broadcastRoomState(io, room);

        if (room.gameState) {
          const view = getRedactedView(room.gameState, providedPlayerId);
          socket.emit('game:view', { view });
        }
        return cb({ playerId: providedPlayerId });
      }

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return cb({ error: 'Name must not be empty' });
      }
      const trimmedName = name.trim().slice(0, 20);

      // ── Name-based reconnect for in-progress games ─────────────────
      if (room.gameState) {
        const byName = Array.from(room.players.values()).find(
          p => p.name.toLowerCase() === trimmedName.toLowerCase()
        );
        if (byName) {
          reconnectPlayer(upperCode, byName.id, socket.id);
          socket.data.playerId = byName.id;
          socket.join(upperCode);

          console.log(`[${upperCode}] ${byName.name} reconnected (by name)`);
          broadcastRoomState(io, room);

          const view = getRedactedView(room.gameState, byName.id);
          socket.emit('game:view', { view });
          return cb({ playerId: byName.id });
        }
        return cb({ error: 'Game already in progress' });
      }

      // ── Normal join ───────────────────────────────────────────────
      const playerId = generatePlayerId();
      const result = joinRoom(upperCode, playerId, trimmedName);
      if ('error' in result) return cb({ error: result.error });

      socket.data.playerId = playerId;
      socket.join(upperCode);
      result.room.socketMap.set(playerId, socket.id);

      console.log(`[${upperCode}] ${trimmedName} joined`);
      broadcastRoomState(io, result.room);
      cb({ playerId });
    });

    // ------------------------------------------------------------------
    // room:leave
    // ------------------------------------------------------------------
    socket.on('room:leave', () => {
      const playerId: string | undefined = socket.data.playerId;
      if (!playerId) return;

      const room = getRoomByPlayerId(playerId);
      if (!room) return;

      if (!room.gameState) {
        removePlayerFromLobby(room.code, playerId);
        socket.leave(room.code);
        console.log(`[${room.code}] player ${playerId} left lobby`);
        broadcastRoomState(io, room);
      } else {
        // Game in progress — just mark as disconnected, keep the seat
        disconnectPlayer(playerId);
        socket.leave(room.code);
        broadcastRoomState(io, room);
        broadcastGameViews(io, room);
      }
      delete socket.data.playerId;
    });

    // ------------------------------------------------------------------
    // game:start  (host only)
    // ------------------------------------------------------------------
    socket.on('game:start', () => {
      const playerId: string | undefined = socket.data.playerId;
      if (!playerId) return sendError(socket, 'NOT_IN_ROOM', 'You are not in a room');

      const room = getRoomByPlayerId(playerId);
      if (!room) return sendError(socket, 'NOT_IN_ROOM', 'Room not found');
      if (room.hostId !== playerId) return sendError(socket, 'NOT_HOST', 'Only the host can start the game');
      if (room.gameState && !room.gameState.winnerId) return sendError(socket, 'ALREADY_STARTED', 'Game already started');
      if (room.players.size < 2) return sendError(socket, 'NOT_ENOUGH_PLAYERS', 'Need at least 2 players to start');

      const playerList = Array.from(room.players.values());
      const gameState = createGame(
        playerList.map(p => ({ id: p.id, name: p.name })),
        Date.now()
      );

      room.gameState = gameState;
      if (!room.matchId) room.matchId = generateMatchId();

      // Record in DB
      recordRoundStart(
        gameState.roundId,
        room.matchId,
        room.code,
        playerList.map((p, i) => ({ id: p.id, name: p.name, seat: i }))
      );

      console.log(`[${room.code}] game started with ${playerList.length} players`);
      broadcastRoomState(io, room);
      broadcastGameViews(io, room);
    });

    // ------------------------------------------------------------------
    // game:action
    // ------------------------------------------------------------------
    socket.on('game:action', ({ action }) => {
      const playerId: string | undefined = socket.data.playerId;
      if (!playerId) return sendError(socket, 'NOT_IN_ROOM', 'You are not in a room');

      const room = getRoomByPlayerId(playerId);
      if (!room) return sendError(socket, 'NOT_IN_ROOM', 'Room not found');
      if (!room.gameState) return sendError(socket, 'GAME_NOT_STARTED', 'Game has not started');

      const result = applyAction(room.gameState, playerId, action as GameAction);
      if (result.error) {
        return sendError(socket, 'INVALID_ACTION', result.error);
      }

      room.gameState = result.state;

      // Clear interaction timeout if the interaction resolved
      const nowPhase = result.state.phase;
      if (nowPhase !== 'AWAITING_RESPONSES' && nowPhase !== 'AWAITING_PAYMENT') {
        clearInteractionTimeout(room.code);
      }

      // Emit game events to the room (action log)
      for (const message of result.events) {
        io.to(room.code).emit('game:event', { message, ts: Date.now() });
      }

      // Schedule a timeout if we are now in a response/payment phase
      // (this also stamps expiresAt on the pending interaction, so it must
      // happen before the views are sent)
      if (!result.state.winnerId && (nowPhase === 'AWAITING_RESPONSES' || nowPhase === 'AWAITING_PAYMENT')) {
        scheduleInteractionTimeout(io, room);
      }

      // Send per-player redacted views
      broadcastGameViews(io, room);

      // Check for game over
      if (result.state.winnerId) {
        handleGameOver(io, room, result.state);
      }
    });

    // ------------------------------------------------------------------
    // chat:message
    // ------------------------------------------------------------------
    socket.on('chat:message', ({ text }) => {
      const playerId: string | undefined = socket.data.playerId;
      if (!playerId) return;

      const room = getRoomByPlayerId(playerId);
      if (!room) return;

      const player = room.players.get(playerId);
      if (!player) return;

      const sanitised = String(text ?? '').trim().slice(0, 200);
      if (!sanitised) return;

      io.to(room.code).emit('chat:message', {
        playerId,
        playerName: player.name,
        text: sanitised,
        ts: Date.now(),
      });
    });

    // ------------------------------------------------------------------
    // disconnect
    // ------------------------------------------------------------------
    socket.on('disconnect', () => {
      const playerId: string | undefined = socket.data.playerId;
      console.log(`[socket] disconnected ${socket.id}${playerId ? ` (player ${playerId})` : ''}`);

      if (!playerId) return;

      const room = getRoomByPlayerId(playerId);
      disconnectPlayer(playerId);

      if (room) {
        broadcastRoomState(io, room);
        if (room.gameState) {
          broadcastGameViews(io, room);
        }
      }
    });
  });
}
