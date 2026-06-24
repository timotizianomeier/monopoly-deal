# Monopoly Deal — Online Multiplayer

A real-time, browser-based implementation of the Monopoly Deal card game for 2–5 players.

## Features

- Full Monopoly Deal rules (all action cards, Just Say No chains, rent, houses/hotels)
- Real-time multiplayer via Socket.IO rooms
- Hand privacy — each player only sees their own cards
- Reconnection — reload the page to resume your seat
- SQLite match scoreboard with per-round win tracking
- Rematch in the same room without rejoining

---

## Local Development

```bash
# Install all workspaces
npm install

# Run server + client in watch mode (two terminals)
npm run dev --workspace=server   # http://localhost:3001
npm run dev --workspace=client   # http://localhost:5173

# Run all tests
npm test --workspace=server
```

The client dev server proxies Socket.IO traffic to the server — see `client/vite.config.ts`.

---

## Production Build

```bash
npm run build --workspace=shared
npm run build --workspace=server
npm run build --workspace=client
# Server serves the built client from client/dist/ when NODE_ENV=production
node server/dist/index.js
```

---

## Deploy on Render

### One-time setup

1. **New Web Service** → connect your GitHub repo.

2. **Build Command**
   ```
   npm install && npm run build --workspace=shared && npm run build --workspace=server && npm run build --workspace=client
   ```

3. **Start Command**
   ```
   node server/dist/index.js
   ```

4. **Environment**
   - Runtime: **Node**
   - Node version: `20` (or `22`)
   - Set `NODE_ENV=production`

5. **Persistent Disk** (for SQLite scoreboard)
   - Mount path: `/data`
   - Size: 1 GB is more than enough
   - Set env var `DB_PATH=/data/monopoly-deal.db`

   Then update `server/src/db.ts` to read the path:
   ```ts
   const DB_PATH = process.env['DB_PATH'] ?? './monopoly-deal.db';
   db = new (Database as any)(DB_PATH);
   ```

6. **Port** — Render sets `PORT` automatically; the server reads `process.env['PORT']`.

### Free tier note

The free Render tier spins down after 15 minutes of inactivity. The first request after spin-down takes ~30 s. Upgrade to the Starter tier ($7/mo) for always-on service.

---

## Project Structure

```
monopoly-deal/
├── shared/          # Shared TypeScript types (cards, state, protocol)
├── server/          # Express + Socket.IO server + game engine
│   └── src/
│       ├── engine/  # Pure deterministic game engine + tests (108 tests)
│       ├── socket.ts
│       ├── rooms.ts
│       └── db.ts    # SQLite scoreboard (graceful fallback if unavailable)
└── client/          # React + Vite frontend
    └── src/
        ├── screens/ # HomeScreen, LobbyScreen, GameScreen, RoundOverModal
        └── components/
```

## Rules Reference

- Each player starts with 5 cards; draw 2 at the start of each turn (draw 5 if empty hand).
- Play up to 3 cards per turn (money to bank counts as 1 play; moving a wildcard is free).
- First player to complete **3 full property sets** wins.
- Just Say No cards can block any action card — and can themselves be blocked by another Just Say No.
