import React from 'react';
import type { Card, Color } from '@monopoly-deal/shared';
import { RENT_LADDERS, SET_SIZES } from '@monopoly-deal/shared';

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

export const COLOR_MAP: Record<Color, string> = {
  brown: '#8B4513',
  lightBlue: '#ADD8E6',
  pink: '#FF69B4',
  orange: '#FFA500',
  red: '#FF4444',
  yellow: '#FFD700',
  green: '#228B22',
  darkBlue: '#00008B',
  railroad: '#555555',
  utility: '#8FBC8F',
};

const DARK_TEXT_COLORS: Color[] = ['lightBlue', 'yellow', 'utility'];

export function colorTextClass(color: Color): string {
  return DARK_TEXT_COLORS.includes(color) ? 'text-dark' : 'text-light';
}

export function getColorStyle(color: Color): React.CSSProperties {
  return {
    backgroundColor: COLOR_MAP[color],
    color: DARK_TEXT_COLORS.includes(color) ? '#222' : '#fff',
  };
}

const ACTION_LABELS: Record<string, string> = {
  dealBreaker: 'Deal Breaker',
  justSayNo: 'Just Say No',
  slyDeal: 'Sly Deal',
  forcedDeal: 'Forced Deal',
  debtCollector: 'Debt Collector',
  birthday: "It's My Birthday",
  doubleTheRent: 'Double the Rent',
  house: 'House',
  hotel: 'Hotel',
  passGo: 'Pass Go',
};

const ACTION_EFFECTS: Record<string, string> = {
  dealBreaker: 'Steal a complete set',
  justSayNo: 'Cancel an action',
  slyDeal: 'Steal 1 property',
  forcedDeal: 'Swap a property',
  debtCollector: 'Charge $5M',
  birthday: 'All pay $2M',
  doubleTheRent: '×2 rent amount',
  house: '+$3M to set',
  hotel: '+$4M to set',
  passGo: 'Draw 2 cards',
};

export function colorLabel(color: Color): string {
  const labels: Record<Color, string> = {
    brown: 'Brown',
    lightBlue: 'Light Blue',
    pink: 'Pink',
    orange: 'Orange',
    red: 'Red',
    yellow: 'Yellow',
    green: 'Green',
    darkBlue: 'Dark Blue',
    railroad: 'Railroad',
    utility: 'Utility',
  };
  return labels[color];
}

// ---------------------------------------------------------------------------
// CardView component
// ---------------------------------------------------------------------------

interface CardViewProps {
  card: Card;
  size?: 'normal' | 'small' | 'tiny';
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  faceDown?: boolean;
}

export default function CardView({ card, size = 'normal', selected, onClick, disabled, faceDown }: CardViewProps) {
  const sizeClass = size === 'small' ? 'card--small' : size === 'tiny' ? 'card--tiny' : '';
  const cls = [
    'card',
    sizeClass,
    selected ? 'card--selected' : '',
    disabled ? 'card--disabled' : '',
    onClick && !disabled ? 'card--clickable' : '',
    faceDown ? 'card--facedown' : '',
  ].filter(Boolean).join(' ');

  if (faceDown) {
    return (
      <div className={cls} onClick={!disabled ? onClick : undefined}>
        <div className="card__back">🂠</div>
      </div>
    );
  }

  return (
    <div className={cls} onClick={!disabled ? onClick : undefined}>
      {renderCardContent(card, size)}
    </div>
  );
}

function renderCardContent(card: Card, size: 'normal' | 'small' | 'tiny') {
  switch (card.type) {
    case 'money':
      return (
        <div className="card__money">
          <div className="card__money-amount">${card.value}M</div>
          <div className="card__bank-value">${card.bankValue}M</div>
        </div>
      );

    case 'property': {
      const ladder = RENT_LADDERS[card.color];
      const rentStr = ladder.join('/');
      const setSize = SET_SIZES[card.color];
      return (
        <div className="card__property" style={getColorStyle(card.color)}>
          <div className="card__property-label">{colorLabel(card.color)}</div>
          {size !== 'tiny' && <div className="card__property-name">{card.name}</div>}
          <div className="card__property-rent">Rent: {rentStr}</div>
          <div className="card__property-set">Set of {setSize}</div>
          <div className="card__bank-value-overlay">${card.bankValue}M</div>
        </div>
      );
    }

    case 'wildcard': {
      if (card.isMultiColor) {
        return (
          <div className="card__wildcard card__wildcard--rainbow">
            <div className="card__wildcard-label">WILDCARD</div>
            <div className="card__wildcard-colors">Any Color</div>
            <div className="card__bank-value">${card.bankValue}M</div>
          </div>
        );
      }
      const c1 = card.colors[0] ?? 'brown';
      const c2 = card.colors[1] ?? 'brown';
      return (
        <div
          className="card__wildcard"
          style={{
            background: `linear-gradient(135deg, ${COLOR_MAP[c1]} 50%, ${COLOR_MAP[c2]} 50%)`,
            color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.7)',
          }}
        >
          <div className="card__wildcard-label">WILDCARD</div>
          {size !== 'tiny' && (
            <div className="card__wildcard-colors">
              {colorLabel(c1)} / {colorLabel(c2)}
            </div>
          )}
          <div className="card__bank-value">${card.bankValue}M</div>
        </div>
      );
    }

    case 'rent': {
      const colorDots = card.isWild
        ? <span className="card__rent-wild">★ Any Color</span>
        : card.colors.map(c => (
            <span key={c} className="card__rent-dot" style={{ backgroundColor: COLOR_MAP[c] }} title={colorLabel(c)} />
          ));
      return (
        <div className="card__rent">
          <div className="card__rent-label">RENT</div>
          <div className="card__rent-colors">{colorDots}</div>
          <div className="card__bank-value">${card.bankValue}M</div>
        </div>
      );
    }

    case 'action': {
      const label = ACTION_LABELS[card.action] ?? card.action;
      const effect = ACTION_EFFECTS[card.action] ?? '';
      return (
        <div className="card__action">
          <div className="card__action-label">{label}</div>
          {size !== 'tiny' && <div className="card__action-effect">{effect}</div>}
          <div className="card__bank-value">${card.bankValue}M</div>
        </div>
      );
    }
  }
}

// ---------------------------------------------------------------------------
// ColorSwatch helper
// ---------------------------------------------------------------------------

export function ColorSwatch({ color, size = 14 }: { color: Color; size?: number }) {
  return (
    <span
      className="color-swatch"
      style={{ backgroundColor: COLOR_MAP[color], width: size, height: size, display: 'inline-block', borderRadius: 3, border: '1px solid rgba(0,0,0,0.3)' }}
      title={colorLabel(color)}
    />
  );
}
