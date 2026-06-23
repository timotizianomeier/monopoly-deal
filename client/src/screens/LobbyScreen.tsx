import React, { useState } from 'react';
import type { SocketHook } from '../socket/useSocket.js';

interface LobbyScreenProps {
  socket: SocketHook;
}

export default function LobbyScreen({ socket }: LobbyScreenProps) {
  const { roomState, playerId, roomCode, startGame, leaveRoom, error, clearError } = socket;
  const [copied, setCopied] = useState(false);

  if (!roomState) {
    return (
      <div className="lobby-screen">
        <div className="lobby-screen__loading">Loading room...</div>
      </div>
    );
  }

  const isHost = roomState.hostId === playerId;
  const canStart = isHost && roomState.players.length >= 2;

  function handleCopyCode() {
    navigator.clipboard.writeText(roomState!.roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleStart() {
    startGame();
  }

  return (
    <div className="lobby-screen">
      <div className="lobby-screen__card">
        <h1 className="lobby-screen__title">Game Lobby</h1>

        {error && (
          <div className="lobby-screen__alert">
            {error}
            <button onClick={clearError}>✕</button>
          </div>
        )}

        <div className="lobby-screen__room-code">
          <span className="lobby-screen__room-code-label">Room Code</span>
          <div className="lobby-screen__room-code-display">
            <span className="lobby-screen__code">{roomState.roomCode}</span>
            <button className="btn btn--tiny" onClick={handleCopyCode}>
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
          <p className="lobby-screen__share-hint">Share this code with friends to join</p>
        </div>

        <div className="lobby-screen__players">
          <h2>Players ({roomState.players.length}/5)</h2>
          <div className="lobby-screen__player-list">
            {roomState.players.map(player => (
              <div key={player.id} className={['lobby-player', !player.connected ? 'lobby-player--disconnected' : ''].join(' ')}>
                <div className="lobby-player__info">
                  <span className="lobby-player__name">{player.name}</span>
                  {player.id === roomState.hostId && (
                    <span className="lobby-player__host-badge">Host</span>
                  )}
                  {player.id === playerId && (
                    <span className="lobby-player__you-badge">You</span>
                  )}
                </div>
                <div className="lobby-player__status">
                  <span className={['lobby-player__dot', player.connected ? 'lobby-player__dot--connected' : 'lobby-player__dot--disconnected'].join(' ')} />
                  <span>{player.connected ? 'Connected' : 'Disconnected'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {roomState.players.length < 2 && (
          <div className="lobby-screen__waiting">
            Waiting for at least 2 players to start...
          </div>
        )}

        <div className="lobby-screen__actions">
          {isHost && (
            <button
              className="btn btn--primary btn--large"
              disabled={!canStart}
              onClick={handleStart}
            >
              Start Game
            </button>
          )}
          {!isHost && (
            <p className="lobby-screen__waiting-host">Waiting for host to start the game...</p>
          )}
          <button className="btn btn--secondary" onClick={leaveRoom}>
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}
