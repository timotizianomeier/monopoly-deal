import React, { useState } from 'react';
import type { SocketHook } from '../socket/useSocket.js';

interface HomeScreenProps {
  socket: SocketHook;
}

export default function HomeScreen({ socket }: HomeScreenProps) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState<'create' | 'join' | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading('create');
    try {
      await socket.createRoom(name.trim());
    } catch {
      // error already set in socket hook
    } finally {
      setLoading(null);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || roomCode.length !== 5) return;
    setLoading('join');
    try {
      await socket.joinRoom(roomCode.toUpperCase(), name.trim());
    } catch {
      // error already set in socket hook
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="home-screen">
      <div className="home-screen__card">
        <div className="home-screen__title">
          <div className="home-screen__logo">🎩</div>
          <h1>Monopoly Deal</h1>
          <p className="home-screen__subtitle">The card game</p>
        </div>

        {!socket.connected && (
          <div className="home-screen__alert home-screen__alert--warning">
            Connecting to server...
          </div>
        )}

        {socket.error && (
          <div className="home-screen__alert home-screen__alert--error">
            {socket.error}
            <button className="home-screen__alert-close" onClick={socket.clearError}>✕</button>
          </div>
        )}

        <div className="home-screen__name-section">
          <label htmlFor="player-name">Your name</label>
          <input
            id="player-name"
            type="text"
            className="input"
            placeholder="Enter your name..."
            value={name}
            onChange={e => setName(e.target.value.slice(0, 20))}
            maxLength={20}
            disabled={!!loading}
          />
        </div>

        <form onSubmit={handleCreate} className="home-screen__form">
          <button
            type="submit"
            className="btn btn--primary btn--large btn--full"
            disabled={!name.trim() || !!loading || !socket.connected}
          >
            {loading === 'create' ? 'Creating...' : 'Create Room'}
          </button>
        </form>

        <div className="home-screen__separator">
          <span>— or —</span>
        </div>

        <form onSubmit={handleJoin} className="home-screen__form home-screen__join-form">
          <input
            type="text"
            className="input home-screen__code-input"
            placeholder="Room code (e.g. ABCDE)"
            value={roomCode}
            onChange={e => setRoomCode(e.target.value.toUpperCase().slice(0, 5))}
            maxLength={5}
            disabled={!!loading}
          />
          <button
            type="submit"
            className="btn btn--secondary btn--large"
            disabled={!name.trim() || roomCode.length !== 5 || !!loading || !socket.connected}
          >
            {loading === 'join' ? 'Joining...' : 'Join Room'}
          </button>
        </form>
      </div>
    </div>
  );
}
