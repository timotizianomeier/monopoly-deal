/**
 * SQLite scoreboard via better-sqlite3.
 *
 * If the native module fails to load (e.g. Node version mismatch or no
 * pre-built binary), all functions fall back to no-ops so the server still
 * starts and runs correctly — just without persistent scorekeeping.
 */

// ---------------------------------------------------------------------------
// Dynamic require with graceful fallback
// ---------------------------------------------------------------------------

// better-sqlite3 is a CommonJS native module. In ESM projects we need
// createRequire to load it synchronously (dynamic import() returns a Promise
// and doesn't work with native addons in all Node versions).
import { createRequire } from 'module';

let db: import('better-sqlite3').Database | null = null;

try {
  const dbPath = process.env['DB_PATH'] ?? './monopoly-deal.db';
  const require = createRequire(import.meta.url);
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  db = new (Database as any)(dbPath) as import('better-sqlite3').Database;
  console.log(`SQLite database opened: ${dbPath}`);
} catch (e) {
  console.warn('SQLite not available — scoreboard disabled:', (e as Error).message);
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const CREATE_PLAYERS = `
CREATE TABLE IF NOT EXISTS players (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);`;

const CREATE_MATCHES = `
CREATE TABLE IF NOT EXISTS matches (
  id         TEXT PRIMARY KEY,
  room_code  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);`;

const CREATE_ROUNDS = `
CREATE TABLE IF NOT EXISTS rounds (
  id         TEXT PRIMARY KEY,
  match_id   TEXT NOT NULL REFERENCES matches(id),
  started_at INTEGER NOT NULL,
  ended_at   INTEGER,
  winner_id  TEXT REFERENCES players(id)
);`;

const CREATE_ROUND_PLAYERS = `
CREATE TABLE IF NOT EXISTS round_players (
  round_id  TEXT NOT NULL REFERENCES rounds(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  seat      INTEGER NOT NULL,
  PRIMARY KEY (round_id, player_id)
);`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function initDb(): void {
  if (!db) return;
  try {
    db.exec(CREATE_PLAYERS);
    db.exec(CREATE_MATCHES);
    db.exec(CREATE_ROUNDS);
    db.exec(CREATE_ROUND_PLAYERS);
  } catch (e) {
    console.warn('SQLite schema init failed:', (e as Error).message);
  }
}

export function ensurePlayer(id: string, name: string): void {
  if (!db) return;
  try {
    db.prepare(
      'INSERT INTO players (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name'
    ).run(id, name);
  } catch (e) {
    console.warn('ensurePlayer error:', (e as Error).message);
  }
}

export function recordRoundStart(
  roundId: string,
  matchId: string,
  roomCode: string,
  players: Array<{ id: string; name: string; seat: number }>
): void {
  if (!db) return;
  try {
    // Upsert match
    db.prepare(
      'INSERT INTO matches (id, room_code, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING'
    ).run(matchId, roomCode, Date.now());

    // Upsert players
    const upsertPlayer = db.prepare(
      'INSERT INTO players (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name'
    );

    // Insert round
    db.prepare(
      'INSERT INTO rounds (id, match_id, started_at) VALUES (?, ?, ?)'
    ).run(roundId, matchId, Date.now());

    // Insert round_players
    const insertSeat = db.prepare(
      'INSERT INTO round_players (round_id, player_id, seat) VALUES (?, ?, ?)'
    );

    const insertAll = db.transaction(() => {
      for (const p of players) {
        upsertPlayer.run(p.id, p.name);
        insertSeat.run(roundId, p.id, p.seat);
      }
    });
    insertAll();
  } catch (e) {
    console.warn('recordRoundStart error:', (e as Error).message);
  }
}

export function recordRoundEnd(roundId: string, winnerId: string): void {
  if (!db) return;
  try {
    db.prepare(
      'UPDATE rounds SET ended_at = ?, winner_id = ? WHERE id = ?'
    ).run(Date.now(), winnerId, roundId);
  } catch (e) {
    console.warn('recordRoundEnd error:', (e as Error).message);
  }
}

export interface ScoreboardRow {
  playerId: string;
  name: string;
  wins: number;
}

export function getMatchScoreboard(roomCode: string): ScoreboardRow[] {
  if (!db) return [];
  try {
    const rows = db.prepare(`
      SELECT p.id AS playerId, p.name, COUNT(r.id) AS wins
      FROM players p
      JOIN round_players rp ON rp.player_id = p.id
      JOIN rounds r ON r.id = rp.round_id
      JOIN matches m ON m.id = r.match_id
      WHERE m.room_code = ?
        AND r.winner_id = p.id
      GROUP BY p.id, p.name
      ORDER BY wins DESC
    `).all(roomCode) as Array<{ playerId: string; name: string; wins: number }>;
    return rows;
  } catch (e) {
    console.warn('getMatchScoreboard error:', (e as Error).message);
    return [];
  }
}
