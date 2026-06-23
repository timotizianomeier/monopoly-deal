import React, { useState } from 'react';
import type { Card, RedactedPlayerView, PropertySet, Color } from '@monopoly-deal/shared';
import type { GameAction } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import { COLOR_MAP, colorLabel } from './CardView.js';

interface DealBreakerModalProps {
  dealBreakerCard: Card;
  players: RedactedPlayerView[];
  myPlayerId: string;
  cardMap: Record<string, Card>;
  sendAction: (action: GameAction) => void;
  onClose: () => void;
}

function completeSets(sets: PropertySet[]): PropertySet[] {
  return sets.filter(s => s.cards.length >= SET_SIZES[s.color]);
}

export default function DealBreakerModal({ dealBreakerCard, players, myPlayerId, cardMap, sendAction, onClose }: DealBreakerModalProps) {
  const opponents = players.filter(p => p.id !== myPlayerId);
  const [targetId, setTargetId] = useState<string>(opponents[0]?.id ?? '');
  const [selectedColor, setSelectedColor] = useState<Color | null>(null);

  const target = players.find(p => p.id === targetId);
  const eligible = target ? completeSets(target.propertySets) : [];

  function handleTargetChange(id: string) {
    setTargetId(id);
    setSelectedColor(null);
  }

  function handleSteal() {
    if (!selectedColor) return;
    sendAction({
      type: 'PLAY_DEAL_BREAKER',
      cardId: dealBreakerCard.id,
      targetId,
      setColor: selectedColor,
    });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal deal-breaker-modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Deal Breaker — Steal a Complete Set</h2>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="modal__body">
          <div className="deal-breaker-modal__section">
            <label>Choose opponent:</label>
            <select
              className="deal-breaker-modal__select"
              value={targetId}
              onChange={e => handleTargetChange(e.target.value)}
            >
              {opponents.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="deal-breaker-modal__section">
            <label>Choose complete set to steal:</label>
            <div className="deal-breaker-modal__sets">
              {eligible.length === 0 && (
                <p className="deal-breaker-modal__empty">No complete sets to steal</p>
              )}
              {eligible.map(set => {
                const isSelected = selectedColor === set.color;
                return (
                  <button
                    key={set.color}
                    className={['deal-breaker-modal__set', isSelected ? 'deal-breaker-modal__set--selected' : ''].join(' ')}
                    style={{ borderColor: COLOR_MAP[set.color], backgroundColor: isSelected ? COLOR_MAP[set.color] + '22' : undefined }}
                    onClick={() => setSelectedColor(set.color)}
                  >
                    <span className="deal-breaker-modal__set-dot" style={{ backgroundColor: COLOR_MAP[set.color] }} />
                    <span className="deal-breaker-modal__set-name">{colorLabel(set.color)}</span>
                    <span className="deal-breaker-modal__set-cards">
                      ({set.cards.map(id => {
                        const c = cardMap[id];
                        return c?.type === 'property' ? c.name.split(' ').pop() : 'Wild';
                      }).join(', ')})
                    </span>
                    {set.hasHouse && <span>🏠</span>}
                    {set.hasHotel && <span>🏨</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn--danger"
            disabled={!selectedColor || eligible.length === 0}
            onClick={handleSteal}
          >
            Steal this set!
          </button>
        </div>
      </div>
    </div>
  );
}
