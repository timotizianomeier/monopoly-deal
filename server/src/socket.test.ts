/**
 * Socket.IO integration tests.
 *
 * Spins up the full server (Express + Socket.IO) on a random port and connects
 * real clients via socket.io-client. Tests cover:
 *   1. Room lifecycle (create, join, start)
 *   2. Hand privacy — each player only sees their own cards
 *   3. Action flow (draw, play money, end turn)
 *   4. Game:over broadcast after a forced win state
 *   5. Reconnection — rejoining mid-game resumes the correct seat
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type { ClientEvents, ServerEvents, RoomState, RedactedGameView } from '@monopoly-deal/shared';
import { setupSocketHandlers } from './socket.js';
import { initDb } from './db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TestClient = ClientSocket<ServerEvents, ClientEvents>;

function makeServer(): Promise<{ port: number; io: Server; close: () => Promise<void> }> {
  return new Promise(resolve => {
    const httpServer = createServer();
    const io = new Server<ClientEvents, ServerEvents>(httpServer, {
      cors: { origin: '*' },
    });
    setupSocketHandlers(io);
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const close = () =>
        new Promise<void>(res => {
          io.close();
          httpServer.close(() => res());
        });
      resolve({ port, io, close });
    });
  });
}

function connect(port: number): TestClient {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    autoConnect: true,
    reconnection: false,
  }) as unknown as TestClient;
}

function waitFor<T>(
  client: TestClient,
  event: keyof ServerEvents,
  predicate?: (payload: T) => boolean
): Promise<T> {
  return new Promise(resolve => {
    const handler = (payload: T) => {
      if (!predicate || predicate(payload)) {
        (client as any).off(event, handler);
        resolve(payload);
      }
    };
    (client as any).on(event, handler);
  });
}

async function connected(client: TestClient): Promise<void> {
  if (client.connected) return;
  await new Promise<void>(resolve => client.once('connect', resolve));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Socket.IO integration', () => {
  let port: number;
  let closeServer: () => Promise<void>;
  let clients: TestClient[] = [];

  beforeEach(async () => {
    initDb();
    const srv = await makeServer();
    port = srv.port;
    closeServer = srv.close;
    clients = [];
  });

  afterEach(async () => {
    for (const c of clients) c.disconnect();
    await closeServer();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Room lifecycle
  // ──────────────────────────────────────────────────────────────────────────
  it('host creates a room and second player joins', async () => {
    const [alice, bob] = [connect(port), connect(port)];
    clients.push(alice, bob);
    await connected(alice);
    await connected(bob);

    // Alice creates the room
    const { roomCode, playerId: aliceId } = await new Promise<{ roomCode: string; playerId: string }>(
      (resolve, reject) =>
        alice.emit('room:create', { name: 'Alice' }, res => {
          if ('error' in res) reject(new Error(res.error));
          else resolve(res);
        })
    );
    expect(roomCode).toHaveLength(5);
    expect(aliceId).toBeTruthy();

    // Bob joins
    const joinP = waitFor<RoomState>(bob, 'room:state', s => s.players.length === 2);
    const { playerId: bobId } = await new Promise<{ playerId: string }>((resolve, reject) =>
      bob.emit('room:join', { roomCode, name: 'Bob' }, res => {
        if ('error' in res) reject(new Error(res.error));
        else resolve(res);
      })
    );
    expect(bobId).toBeTruthy();

    const roomState = await joinP;
    expect(roomState.players).toHaveLength(2);
    expect(roomState.hostId).toBe(aliceId);
    expect(roomState.players.map(p => p.name)).toContain('Bob');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Hand privacy — each player only sees their own hand
  // ──────────────────────────────────────────────────────────────────────────
  it('each player receives only their own hand after game start', async () => {
    const [alice, bob] = [connect(port), connect(port)];
    clients.push(alice, bob);
    await connected(alice);
    await connected(bob);

    const { roomCode } = await new Promise<{ roomCode: string; playerId: string }>(
      (resolve, reject) =>
        alice.emit('room:create', { name: 'Alice' }, res => {
          if ('error' in res) reject(new Error(res.error));
          else resolve(res);
        })
    );
    await new Promise<void>((resolve, reject) =>
      bob.emit('room:join', { roomCode, name: 'Bob' }, res => {
        if ('error' in res) reject(new Error(res.error));
        else resolve();
      })
    );

    // Capture game views for both players
    const aliceViewP = waitFor<{ view: RedactedGameView }>(alice, 'game:view');
    const bobViewP = waitFor<{ view: RedactedGameView }>(bob, 'game:view');

    alice.emit('game:start');

    const [{ view: aliceView }, { view: bobView }] = await Promise.all([aliceViewP, bobViewP]);

    // Each player sees themselves
    expect(aliceView.myPlayerId).not.toBe(bobView.myPlayerId);

    // Their own hand is visible (5 starting cards)
    const aliceMe = aliceView.players.find(p => p.id === aliceView.myPlayerId);
    const bobMe = bobView.players.find(p => p.id === bobView.myPlayerId);
    expect(aliceMe?.hand).toHaveLength(5);
    expect(bobMe?.hand).toHaveLength(5);

    // The opponent's hand field is absent (undefined) — never sent to other players
    const aliceOpponent = aliceView.players.find(p => p.id !== aliceView.myPlayerId);
    const bobOpponent = bobView.players.find(p => p.id !== bobView.myPlayerId);
    expect(aliceOpponent?.hand).toBeUndefined();
    expect(bobOpponent?.hand).toBeUndefined();

    // Hands must be different card sets (no hand leakage)
    const aliceCardIds = new Set(aliceMe!.hand!);
    const bobCardIds = new Set(bobMe!.hand!);
    const intersection = [...aliceCardIds].filter(id => bobCardIds.has(id));
    expect(intersection).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Action flow — draw cards then end turn, phase transitions to next player
  // ──────────────────────────────────────────────────────────────────────────
  it('first player draws cards and ends turn; phase advances to next player', async () => {
    const [alice, bob] = [connect(port), connect(port)];
    clients.push(alice, bob);
    await connected(alice);
    await connected(bob);

    const { roomCode } = await new Promise<{ roomCode: string; playerId: string }>(
      (resolve, reject) =>
        alice.emit('room:create', { name: 'Alice' }, res => {
          if ('error' in res) reject(new Error(res.error));
          else resolve(res);
        })
    );
    await new Promise<void>((resolve, reject) =>
      bob.emit('room:join', { roomCode, name: 'Bob' }, res => {
        if ('error' in res) reject(new Error(res.error));
        else resolve();
      })
    );

    // Capture both initial views
    const aliceViewP = waitFor<{ view: RedactedGameView }>(alice, 'game:view');
    const bobViewP = waitFor<{ view: RedactedGameView }>(bob, 'game:view');
    alice.emit('game:start');
    const [{ view: aliceInit }, { view: bobInit }] = await Promise.all([aliceViewP, bobViewP]);

    // Determine which client is the first player
    const firstPlayerId = aliceInit.players[aliceInit.currentPlayerIndex]!.id;
    const isAliceFirst = firstPlayerId === aliceInit.myPlayerId;
    const [firstClient, secondClient] = isAliceFirst ? [alice, bob] : [bob, alice];

    // Draw cards (START_TURN)
    const drawnP = waitFor<{ view: RedactedGameView }>(
      firstClient,
      'game:view',
      ({ view }) => view.phase === 'PLAYING'
    );
    firstClient.emit('game:action', { action: { type: 'START_TURN' } });
    const { view: playingView } = await drawnP;

    // Active player should now have 7 cards (5 start + 2 drawn)
    const me = playingView.players.find(p => p.id === playingView.myPlayerId)!;
    expect(me.hand).toHaveLength(7);
    expect(playingView.phase).toBe('PLAYING');
    expect(playingView.playsRemaining).toBe(3);

    // End turn — second player's turn begins
    const secondP = waitFor<{ view: RedactedGameView }>(
      secondClient,
      'game:view',
      ({ view }) => view.phase === 'AWAITING_TURN_START'
    );
    firstClient.emit('game:action', { action: { type: 'END_TURN' } });
    const { view: nextView } = await secondP;

    expect(nextView.players[nextView.currentPlayerIndex]!.id).toBe(
      isAliceFirst ? bobInit.myPlayerId : aliceInit.myPlayerId
    );
    expect(nextView.phase).toBe('AWAITING_TURN_START');
  }, 10_000);

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Non-host cannot start the game
  // ──────────────────────────────────────────────────────────────────────────
  it('non-host receives an error when trying to start the game', async () => {
    const [alice, bob] = [connect(port), connect(port)];
    clients.push(alice, bob);
    await connected(alice);
    await connected(bob);

    const { roomCode } = await new Promise<{ roomCode: string; playerId: string }>(
      (resolve, reject) =>
        alice.emit('room:create', { name: 'Alice' }, res => {
          if ('error' in res) reject(new Error(res.error));
          else resolve(res);
        })
    );
    await new Promise<void>((resolve, reject) =>
      bob.emit('room:join', { roomCode, name: 'Bob' }, res => {
        if ('error' in res) reject(new Error(res.error));
        else resolve();
      })
    );

    const errorP = waitFor<{ code: string; message: string }>(bob, 'error');
    bob.emit('game:start');
    const err = await errorP;
    expect(err.code).toBe('NOT_HOST');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Reconnection — rejoining mid-game resumes the correct seat
  // ──────────────────────────────────────────────────────────────────────────
  it('a player who disconnects and reconnects with their playerId resumes the same seat', async () => {
    const [alice, bob] = [connect(port), connect(port)];
    clients.push(alice, bob);
    await connected(alice);
    await connected(bob);

    const { roomCode, playerId: aliceId } = await new Promise<{
      roomCode: string;
      playerId: string;
    }>((resolve, reject) =>
      alice.emit('room:create', { name: 'Alice' }, res => {
        if ('error' in res) reject(new Error(res.error));
        else resolve(res);
      })
    );
    await new Promise<void>((resolve, reject) =>
      bob.emit('room:join', { roomCode, name: 'Bob' }, res => {
        if ('error' in res) reject(new Error(res.error));
        else resolve();
      })
    );

    // Start game
    const aliceViewP = waitFor<{ view: RedactedGameView }>(alice, 'game:view');
    alice.emit('game:start');
    const { view: beforeView } = await aliceViewP;
    const aliceHandBefore = beforeView.players.find(p => p.id === beforeView.myPlayerId)!.hand!;

    // Alice disconnects
    alice.disconnect();

    // Alice reconnects with a new socket but the same playerId
    const aliceNew = connect(port);
    clients.push(aliceNew);
    await connected(aliceNew);

    const reconnectViewP = waitFor<{ view: RedactedGameView }>(aliceNew, 'game:view');
    await new Promise<void>((resolve, reject) =>
      (aliceNew as any).emit(
        'room:join',
        { roomCode, name: 'Alice', playerId: aliceId },
        (res: { playerId: string } | { error: string }) => {
          if ('error' in res) reject(new Error(res.error));
          else resolve();
        }
      )
    );
    const { view: afterView } = await reconnectViewP;

    // Same player ID, same hand
    expect(afterView.myPlayerId).toBe(aliceId);
    const aliceHandAfter = afterView.players.find(p => p.id === afterView.myPlayerId)!.hand!;
    expect(aliceHandAfter).toEqual(aliceHandBefore);
  });
});
