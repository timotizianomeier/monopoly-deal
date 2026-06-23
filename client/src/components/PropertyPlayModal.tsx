import React, { useState } from 'react';
import type { Card, Color, WildcardCard } from '@monopoly-deal/shared';
import type { GameAction } from '@monopoly-deal/shared';
import { COLOR_MAP, colorLabel } from './CardView.js';
import CardView from './CardView.js';

interface PropertyPlayModalProps {
  card: Card; // property or wildcard
  onPlay: (color: Color) => void;
  onClose: () => void;
}

export default function PropertyPlayModal({ card, onPlay, onClose }: PropertyPlayModalProps) {
  const colors: Color[] = card.type === 'property'
    ? [card.color]
    : (card as WildcardCard).colors;

  const [selected, setSelected] = useState<Color>(colors[0] ?? 'brown');

  function handlePlay() {
    onPlay(selected);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal property-play-modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Choose Color Set</h2>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="modal__body">
          <div className="property-play-modal__card-preview">
            <CardView card={card} />
          </div>
          <div className="property-play-modal__colors">
            {colors.map(c => (
              <button
                key={c}
                className={['property-play-modal__color', selected === c ? 'property-play-modal__color--selected' : ''].join(' ')}
                style={{ backgroundColor: COLOR_MAP[c], color: ['lightBlue', 'yellow', 'utility'].includes(c) ? '#222' : '#fff', borderColor: selected === c ? '#fff' : 'transparent' }}
                onClick={() => setSelected(c)}
              >
                {colorLabel(c)}
              </button>
            ))}
          </div>
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={handlePlay}>
            Play to {colorLabel(selected)} set
          </button>
        </div>
      </div>
    </div>
  );
}
