import React, { useState } from 'react';
import type { Card } from '@monopoly-deal/shared';
import type { GameAction } from '@monopoly-deal/shared';
import CardView from './CardView.js';

interface DiscardPromptProps {
  hand: Card[];
  sendAction: (action: GameAction) => void;
}

const MAX_HAND = 7;

export default function DiscardPrompt({ hand, sendAction }: DiscardPromptProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const mustDiscard = Math.max(0, hand.length - MAX_HAND);

  function toggleCard(cardId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else if (next.size < mustDiscard) {
        next.add(cardId);
      }
      return next;
    });
  }

  function handleDiscard() {
    sendAction({ type: 'DISCARD', cardIds: Array.from(selectedIds) });
  }

  const ready = selectedIds.size === mustDiscard;

  return (
    <div className="modal-overlay">
      <div className="modal discard-prompt">
        <div className="modal__header">
          <h2>Discard Cards</h2>
        </div>
        <div className="modal__body">
          <p className="discard-prompt__info">
            You have <strong>{hand.length}</strong> cards. Discard <strong>{mustDiscard}</strong> to get down to {MAX_HAND}.
            <br />
            Selected: {selectedIds.size} / {mustDiscard}
          </p>
          <div className="discard-prompt__cards">
            {hand.map(card => (
              <div
                key={card.id}
                className={['discard-prompt__card', selectedIds.has(card.id) ? 'discard-prompt__card--selected' : ''].join(' ')}
                onClick={() => toggleCard(card.id)}
              >
                <CardView card={card} selected={selectedIds.has(card.id)} />
                {selectedIds.has(card.id) && <div className="discard-prompt__card-overlay">DISCARD</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="modal__footer">
          <button
            className="btn btn--danger"
            disabled={!ready}
            onClick={handleDiscard}
          >
            Discard {mustDiscard} Card{mustDiscard !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
