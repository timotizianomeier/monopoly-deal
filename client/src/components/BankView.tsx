import React from 'react';
import type { Card } from '@monopoly-deal/shared';
import CardView from './CardView.js';

interface BankViewProps {
  cards: Card[];
  compact?: boolean;
}

export default function BankView({ cards, compact = false }: BankViewProps) {
  const total = cards.reduce((sum, c) => sum + c.bankValue, 0);

  if (compact) {
    return (
      <div className="bank-view bank-view--compact">
        <span className="bank-view__total">${total}M</span>
      </div>
    );
  }

  return (
    <div className="bank-view">
      <div className="bank-view__header">
        <span className="bank-view__label">Bank</span>
        <span className="bank-view__total">${total}M</span>
      </div>
      <div className="bank-view__cards">
        {cards.length === 0 && <span className="bank-view__empty">Empty</span>}
        {cards.map(card => (
          <CardView key={card.id} card={card} size="small" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selectable bank for payment
// ---------------------------------------------------------------------------

interface SelectableBankProps {
  cards: Card[];
  selectedIds: Set<string>;
  onToggle: (cardId: string) => void;
}

export function SelectableBank({ cards, selectedIds, onToggle }: SelectableBankProps) {
  return (
    <div className="bank-view__cards bank-view__cards--selectable">
      {cards.map(card => (
        <div key={card.id} className="bank-view__selectable-item">
          <input
            type="checkbox"
            id={`bank-${card.id}`}
            checked={selectedIds.has(card.id)}
            onChange={() => onToggle(card.id)}
          />
          <label htmlFor={`bank-${card.id}`}>
            <CardView card={card} size="small" selected={selectedIds.has(card.id)} />
          </label>
        </div>
      ))}
    </div>
  );
}
