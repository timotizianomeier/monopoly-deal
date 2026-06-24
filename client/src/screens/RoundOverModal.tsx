import React from 'react';
import type { ScoreEntry } from '@monopoly-deal/shared';
import type { SocketHook } from '../socket/useSocket.js';

interface RoundOverModalProps {
  gameOver: { winnerId: string; scoreboard: ScoreEntry[] };
  socket: SocketHook;
}

export default function RoundOverModal({ gameOver, socket }: RoundOverModalProps) {
  const winner = gameOver.scoreboard.find(e => e.playerId === gameOver.winnerId);
  const isHost = socket.roomState?.hostId === socket.playerId;

  return (
    <div className="modal-overlay">
      <div className="modal round-over-modal">
        <div className="modal__header">
          <h2>🏆 Game Over!</h2>
        </div>
        <div className="modal__body">
          {winner && (
            <div className="round-over-modal__winner">
              <div className="round-over-modal__winner-crown">🎉</div>
              <div className="round-over-modal__winner-name">{winner.playerName}</div>
              <div className="round-over-modal__winner-label">wins with 3 complete sets!</div>
            </div>
          )}

          <div className="round-over-modal__scoreboard">
            <h3>Scoreboard</h3>
            <table className="scoreboard-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Wins</th>
                  <th>Sets</th>
                  <th>Bank</th>
                </tr>
              </thead>
              <tbody>
                {gameOver.scoreboard.map((entry, i) => (
                  <tr
                    key={entry.playerId}
                    className={[
                      entry.playerId === gameOver.winnerId ? 'scoreboard-table__row--winner' : '',
                      entry.playerId === socket.playerId ? 'scoreboard-table__row--you' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <td>
                      <span className="scoreboard-table__rank">#{i + 1}</span>
                      {entry.playerName}
                      {entry.playerId === socket.playerId && <span className="scoreboard-table__you"> (You)</span>}
                      {entry.playerId === gameOver.winnerId && <span className="scoreboard-table__crown"> 🏆</span>}
                    </td>
                    <td>{entry.wins ?? 0}</td>
                    <td>{entry.completeSets}</td>
                    <td>${entry.bankTotal}M</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal__footer">
          {isHost && (
            <button className="btn btn--primary btn--large" onClick={socket.rematch}>
              Rematch!
            </button>
          )}
          {!isHost && (
            <p className="round-over-modal__waiting">Waiting for host to start a rematch...</p>
          )}
          <button className="btn btn--secondary" onClick={socket.leaveRoom}>
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}
