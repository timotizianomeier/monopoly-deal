/**
 * In-memory room + game state manager.
 *
 * Rooms are keyed by a 5-character alphanumeric code (ambiguous chars excluded).
 * Each room tracks lobby players, the live GameState, and socket bindings.
 */

import type { GameState } from '@monopoly-deal/shared';
import type { RoomPlayer } from '@monopoly-deal/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Room {
  code: string;
  hostId: string;
  /** playerId → RoomPlayer */
  players: Map<string, RoomPlayer>;
  /** playerId → current socketId */
  socketMap: Map<string, string>;
  gameState: GameState | null;
  createdAt: number;
  /** matchId for DB tracking (set when game starts) */
  matchId: string | null;
}

// ---------------------------------------------------------------------------
// Module-level store
// ---------------------------------------------------------------------------

const rooms = new Map<string, Room>();

// ---------------------------------------------------------------------------
// ID / Code generators
// ---------------------------------------------------------------------------

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1

export function generateRoomCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 5 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]!
    ).join('');
  } while (rooms.has(code));
  return code;
}

export function generatePlayerId(): string {
  return Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

export function generateMatchId(): string {
  return `match_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new room and add the host as the first player.
 */
export function createRoom(hostId: string, hostName: string): Room {
  const code = generateRoomCode();
  const host: RoomPlayer = { id: hostId, name: hostName, connected: true, ready: false };
  const room: Room = {
    code,
    hostId,
    players: new Map([[hostId, host]]),
    socketMap: new Map(),
    gameState: null,
    createdAt: Date.now(),
    matchId: null,
  };
  rooms.set(code, room);
  return room;
}

/**
 * Add a player to a lobby.
 * Returns the room on success, or null with a reason string on failure.
 */
export function joinRoom(
  code: string,
  playerId: string,
  playerName: string
): { room: Room } | { error: string } {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { error: 'Room not found' };
  if (room.gameState !== null) return { error: 'Game already in progress' };
  if (room.players.size >= 5) return { error: 'Room is full (5 players max)' };

  const player: RoomPlayer = { id: playerId, name: playerName, connected: true, ready: false };
  room.players.set(playerId, player);
  return { room };
}

export function getRoomByCode(code: string): Room | null {
  return rooms.get(code.toUpperCase()) ?? null;
}

export function getRoomByPlayerId(playerId: string): Room | null {
  for (const room of rooms.values()) {
    if (room.players.has(playerId)) return room;
  }
  return null;
}

/**
 * Update socketMap for a reconnecting player. Returns false if player not in room.
 */
export function reconnectPlayer(code: string, playerId: string, socketId: string): boolean {
  const room = rooms.get(code.toUpperCase());
  if (!room) return false;
  const player = room.players.get(playerId);
  if (!player) return false;

  room.socketMap.set(playerId, socketId);

  // Mark as connected in game state if a game is running
  if (room.gameState) {
    room.gameState = {
      ...room.gameState,
      players: room.gameState.players.map(p =>
        p.id === playerId ? { ...p, connected: true } : p
      ),
    };
  }
  // Mark as connected in the lobby player list too
  room.players.set(playerId, { ...player, connected: true });
  return true;
}

/**
 * Mark a player as disconnected (does not remove them from the room).
 */
export function disconnectPlayer(playerId: string): void {
  const room = getRoomByPlayerId(playerId);
  if (!room) return;

  const player = room.players.get(playerId);
  if (player) {
    room.players.set(playerId, { ...player, connected: false });
  }

  // Remove the dead socket mapping
  room.socketMap.delete(playerId);

  // Mark disconnected in live game state
  if (room.gameState) {
    room.gameState = {
      ...room.gameState,
      players: room.gameState.players.map(p =>
        p.id === playerId ? { ...p, connected: false } : p
      ),
    };
  }
}

/**
 * Remove a player from the lobby (only allowed before the game starts).
 */
export function removePlayerFromLobby(code: string, playerId: string): boolean {
  const room = rooms.get(code.toUpperCase());
  if (!room || room.gameState !== null) return false;
  room.players.delete(playerId);
  room.socketMap.delete(playerId);
  return true;
}

/**
 * Get a serialisable snapshot of all rooms (for debugging / admin).
 */
export function listRooms(): Array<{ code: string; players: number; started: boolean }> {
  return Array.from(rooms.values()).map(r => ({
    code: r.code,
    players: r.players.size,
    started: r.gameState !== null,
  }));
}
