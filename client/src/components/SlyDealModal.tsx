import React, { useState } from 'react';
import type { Card, RedactedPlayerView, PropertySet } from '@monopoly-deal/shared';
import type { GameAction } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import CardView from './CardView.js';

interface SlyDealModalProps {
  slyDealCard: Card;
  players: RedactedPlayerView[];
  myPlayerId: string;
  cardMap: Record<string, Card>;
  sendAction: (action: GameAction) => void;
  onClose: () => void;
}

function stealableCards(sets: PropertySet[], cardMap: Record<string, Card>): Card[] {
  const result: Card[] = [];
  for (const set of sets) {
    const isComplete = set.cards.length >= SET_SIZES[set.color];
    if (isComplete) continue; // can't steal from complete sets
    for (const cardId of set.cards) {
      const card = cardMap[cardId];
      if (card) result.push(card);
    }
  }
  return result;
}

export default function SlyDealModal({ slyDealCard, players, myPlayerId, cardMap, sendAction, onClose }: SlyDealModalProps) {
  const opponents = players.filter(p => p.id !== myPlayerId);
  const [targetId, setTargetId] = useState<string>(opponents[0]?.id ?? '');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const target = players.find(p => p.id === targetId);
  const available = target ? stealableCards(target.propertySets, cardMap) : [];

  function handleTargetChange(id: string) {
    setTargetId(id);
    setSelectedCardId(null);
  }

  function handleSteal() {
    if (!selectedCardId) return;
    sendAction({
      type: 'PLAY_SLY_DEAL',
      cardId: slyDealCard.id,
      targetId,
      targetCardId: selectedCardId,
    });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sly-deal-modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Sly Deal — Steal a Property</h2>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="modal__body">
          <div className="sly-deal-modal__section">
            <label className="sly-deal-modal__label">Choose opponent:</label>
            <select
              className="sly-deal-modal__select"
              value={targetId}
              onChange={e => handleTargetChange(e.target.value)}
            >
              {opponents.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="sly-deal-modal__section">
            <label className="sly-deal-modal__label">Choose property to steal (not from complete sets):</label>
            <div className="sly-deal-modal__cards">
              {available.length === 0 && (
                <p className="sly-deal-modal__empty">No stealable properties (all sets are complete)</p>
              )}
              {available.map(card => (
                <div
                  key={card.id}
                  className={['sly-deal-modal__card', selectedCardId === card.id ? 'sly-deal-modal__card--selected' : ''].join(' ')}
                  onClick={() => setSelectedCardId(card.id)}
                >
                  <CardView card={card} size="small" selected={selectedCardId === card.id} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn--primary"
            disabled={!selectedCardId || available.length === 0}
            onClick={handleSteal}
          >
            Steal this card
          </button>
        </div>
      </div>
    </div>
  );
}
