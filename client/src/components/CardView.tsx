import React from 'react';
import type { Card, Color } from '@monopoly-deal/shared';
import { RENT_LADDERS, SET_SIZES } from '@monopoly-deal/shared';
import { ACTION_ART, ACTION_ACCENT, RentCircle, WildRentCircle } from './CardArt';

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
        <div className="card__back">
          <div className="card__back-oval">
            <span className="card__back-brand">MONOPOLY</span>
            <span className="card__back-deal">DEAL</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cls} onClick={!disabled ? onClick : undefined}>
      {renderCardContent(card, size)}
    </div>
  );
}

/** Corner value badge shown on every face-up card (like the deck's corner values). */
function ValueBadge({ value }: { value: number }) {
  return <div className="card__value-badge">{value}<span className="card__value-badge-m">M</span></div>;
}

/** Colors for money denominations — each bill value gets its own hue. */
const MONEY_COLORS: Record<number, string> = {
  1: '#b8a03c',
  2: '#c96f8e',
  3: '#3d9970',
  4: '#5b8fc9',
  5: '#8e5fa8',
  10: '#d97e2f',
};

function renderCardContent(card: Card, size: 'normal' | 'small' | 'tiny') {
  switch (card.type) {
    case 'money': {
      const mc = MONEY_COLORS[card.value] ?? '#3d9970';
      return (
        <div className="card__money" style={{ borderColor: mc }}>
          <ValueBadge value={card.bankValue} />
          <div className="card__money-oval" style={{ backgroundColor: mc }}>
            <div className="card__money-amount">${card.value}M</div>
          </div>
        </div>
      );
    }

    case 'property': {
      const ladder = RENT_LADDERS[card.color];
      const setSize = SET_SIZES[card.color];
      return (
        <div className="card__property">
          <div className={`card__property-band ${colorTextClass(card.color)}`} style={getColorStyle(card.color)}>
            {size === 'tiny' ? colorLabel(card.color) : card.name}
          </div>
          {size !== 'tiny' && (
            <div className="card__property-deed">
              <div className="card__property-rent-ladder">
                {ladder.map((rent, i) => (
                  <div key={i} className="card__property-rent-row">
                    <span className="card__property-rent-count">{i + 1}</span>
                    <span className="card__property-rent-dots" />
                    <span className="card__property-rent-amount">${rent}M</span>
                  </div>
                ))}
              </div>
              <div className="card__property-set">Full set: {setSize}</div>
            </div>
          )}
          <ValueBadge value={card.bankValue} />
        </div>
      );
    }

    case 'wildcard': {
      if (card.isMultiColor) {
        return (
          <div className="card__wildcard">
            <div className="card__wildcard-stripes">
              {(Object.keys(COLOR_MAP) as Color[]).map(c => (
                <div key={c} style={{ backgroundColor: COLOR_MAP[c] }} />
              ))}
            </div>
            <div className="card__wildcard-center">
              <div className="card__wildcard-label">WILD</div>
              {size !== 'tiny' && <div className="card__wildcard-colors">any color</div>}
            </div>
            <ValueBadge value={card.bankValue} />
          </div>
        );
      }
      const c1 = card.colors[0] ?? 'brown';
      const c2 = card.colors[1] ?? 'brown';
      const half = (c: Color, flipped: boolean) => (
        <div className={['card__wildcard-half', flipped ? 'card__wildcard-half--flipped' : ''].join(' ')}>
          <div className={`card__wildcard-band ${colorTextClass(c)}`} style={getColorStyle(c)}>
            {size !== 'tiny' && colorLabel(c)}
          </div>
          {size !== 'tiny' && (
            <div className="card__wildcard-ladder">
              {RENT_LADDERS[c].map((rent, i) => (
                <div key={i} className="card__property-rent-row">
                  <span className="card__property-rent-count">{i + 1}</span>
                  <span className="card__property-rent-dots" />
                  <span className="card__property-rent-amount">${rent}M</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
      return (
        <div className="card__wildcard card__wildcard--two">
          {half(c1, false)}
          <div className="card__wildcard-divider">
            <svg viewBox="0 0 24 24" className="card__wildcard-swap" aria-hidden="true">
              <path d="M12 3 L8 8 H10.5 V16 H8 L12 21 L16 16 H13.5 V8 H16 Z" fill="#2c3e50" />
            </svg>
          </div>
          {half(c2, true)}
          <ValueBadge value={card.bankValue} />
        </div>
      );
    }

    case 'rent': {
      const c1 = card.colors[0] ?? 'brown';
      const c2 = card.colors[1] ?? 'brown';
      return (
        <div className="card__rent">
          <div className="card__rent-label">RENT</div>
          <div className="card__rent-art">
            {card.isWild
              ? <WildRentCircle colors={Object.values(COLOR_MAP)} />
              : <RentCircle c1={COLOR_MAP[c1]} c2={COLOR_MAP[c2]} />}
          </div>
          {size !== 'tiny' && (
            <div className="card__rent-colors-label">
              {card.isWild ? 'any color' : `${colorLabel(c1)} / ${colorLabel(c2)}`}
            </div>
          )}
          <ValueBadge value={card.bankValue} />
        </div>
      );
    }

    case 'action': {
      const label = ACTION_LABELS[card.action] ?? card.action;
      const effect = ACTION_EFFECTS[card.action] ?? '';
      const accent = ACTION_ACCENT[card.action] ?? '#d35400';
      const Art = ACTION_ART[card.action];
      return (
        <div className="card__action" style={{ borderColor: accent }}>
          <div className="card__action-label" style={{ color: accent }}>{label}</div>
          {Art && <div className="card__action-art"><Art /></div>}
          {size === 'normal' && <div className="card__action-effect">{effect}</div>}
          <ValueBadge value={card.bankValue} />
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
