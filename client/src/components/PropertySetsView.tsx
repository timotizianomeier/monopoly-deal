import React from 'react';
import type { PropertySet, Card, Color } from '@monopoly-deal/shared';
import { SET_SIZES, RENT_LADDERS, HOUSE_BONUS, HOTEL_BONUS } from '@monopoly-deal/shared';
import { COLOR_MAP, colorLabel } from './CardView.js';

interface PropertySetsViewProps {
  sets: PropertySet[];
  cardMap: Record<string, Card>;
  compact?: boolean;
}

function getRentForSet(set: PropertySet): number {
  const ladder = RENT_LADDERS[set.color];
  const count = set.cards.length;
  const baseIdx = Math.min(count - 1, ladder.length - 1);
  let rent = count > 0 ? (ladder[baseIdx] ?? 0) : 0;
  if (set.hasHouse) rent += HOUSE_BONUS;
  if (set.hasHotel) rent += HOTEL_BONUS;
  return rent;
}

export default function PropertySetsView({ sets, cardMap, compact = false }: PropertySetsViewProps) {
  if (sets.length === 0) {
    return <div className="property-sets property-sets--empty"><span>No properties</span></div>;
  }

  return (
    <div className="property-sets">
      {sets.map(set => {
        const setSize = SET_SIZES[set.color];
        const isComplete = set.cards.length >= setSize;
        const rent = getRentForSet(set);
        const bgColor = COLOR_MAP[set.color];

        return (
          <div
            key={set.color}
            className={['property-set', isComplete ? 'property-set--complete' : ''].filter(Boolean).join(' ')}
            style={{ borderColor: bgColor }}
          >
            <div className="property-set__header" style={{ backgroundColor: bgColor }}>
              <span className="property-set__color-name">{colorLabel(set.color)}</span>
              <span className="property-set__count">{set.cards.length}/{setSize}</span>
              {isComplete && <span className="property-set__complete-badge">✓</span>}
            </div>

            <div className="property-set__cards">
              {set.cards.map(cardId => {
                const card = cardMap[cardId];
                if (!card) return null;
                return (
                  <div key={cardId} className="property-set__card-chip">
                    {compact
                      ? <span className="property-set__card-dot" style={{ backgroundColor: bgColor }} />
                      : <span className="property-set__card-name">
                          {card.type === 'property' ? card.name.split(' ').slice(-1)[0] :
                           card.type === 'wildcard' ? 'Wild' : card.type}
                        </span>
                    }
                  </div>
                );
              })}

              {set.hasHouse && (
                <div className="property-set__building property-set__house">🏠</div>
              )}
              {set.hasHotel && (
                <div className="property-set__building property-set__hotel">🏨</div>
              )}
            </div>

            <div className="property-set__footer">
              <span className="property-set__rent">Rent: ${rent}M</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standalone set picker (used in modals)
// ---------------------------------------------------------------------------

interface SetPickerProps {
  sets: PropertySet[];
  cardMap: Record<string, Card>;
  selectedColor: Color | null;
  onSelect: (color: Color) => void;
  filterFn?: (set: PropertySet) => boolean;
}

export function SetPicker({ sets, cardMap, selectedColor, onSelect, filterFn }: SetPickerProps) {
  const eligible = filterFn ? sets.filter(filterFn) : sets;

  if (eligible.length === 0) {
    return <div className="set-picker__empty">No eligible sets</div>;
  }

  return (
    <div className="set-picker">
      {eligible.map(set => {
        const setSize = SET_SIZES[set.color];
        const isComplete = set.cards.length >= setSize;
        const bgColor = COLOR_MAP[set.color];
        const isSelected = selectedColor === set.color;

        return (
          <button
            key={set.color}
            className={['set-picker__item', isSelected ? 'set-picker__item--selected' : ''].filter(Boolean).join(' ')}
            style={{ borderColor: bgColor, backgroundColor: isSelected ? bgColor + '33' : undefined }}
            onClick={() => onSelect(set.color)}
          >
            <span className="set-picker__dot" style={{ backgroundColor: bgColor }} />
            <span>{colorLabel(set.color)}</span>
            <span className="set-picker__count">{set.cards.length}/{setSize}</span>
            {isComplete && <span>✓</span>}
          </button>
        );
      })}
    </div>
  );
}
