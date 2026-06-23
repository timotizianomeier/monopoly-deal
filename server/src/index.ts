import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupSocketHandlers } from './socket.js';
import { initDb } from './db.js';
import type { ClientEvents, ServerEvents } from '@monopoly-deal/shared';

// ---------------------------------------------------------------------------
// ESM __dirname shim
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// HTTP + Socket.IO setup
// ---------------------------------------------------------------------------

const PORT = process.env['PORT'] ?? 3001;
const app = express();
const httpServer = createServer(app);

const io = new Server<ClientEvents, ServerEvents>(httpServer, {
  cors: {
    origin: process.env['NODE_ENV'] === 'production' ? false : '*',
  },
});

// ---------------------------------------------------------------------------
// Static serving in production
// ---------------------------------------------------------------------------

if (process.env['NODE_ENV'] === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

initDb();
setupSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Monopoly Deal server running on port ${PORT}`);
});
