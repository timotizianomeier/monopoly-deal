import React, { useState } from 'react';
import type { Card, RentCard, ActionCard, Color, RedactedPlayerView, PropertySet } from '@monopoly-deal/shared';
import type { GameAction } from '@monopoly-deal/shared';
import { RENT_LADDERS, SET_SIZES, HOUSE_BONUS, HOTEL_BONUS } from '@monopoly-deal/shared';
import { COLOR_MAP, colorLabel } from './CardView.js';

interface PlayRentModalProps {
  rentCard: Card; // RentCard
  hand: Card[];
  myPropertySets: PropertySet[];
  players: RedactedPlayerView[];
  myPlayerId: string;
  sendAction: (action: GameAction) => void;
  onClose: () => void;
}

function calcRent(sets: PropertySet[], color: Color): number {
  const set = sets.find(s => s.color === color);
  if (!set || set.cards.length === 0) return 0;
  const ladder = RENT_LADDERS[color];
  const idx = Math.min(set.cards.length - 1, ladder.length - 1);
  let rent = ladder[idx] ?? 0;
  if (set.hasHouse) rent += HOUSE_BONUS;
  if (set.hasHotel) rent += HOTEL_BONUS;
  return rent;
}

export default function PlayRentModal({ rentCard, hand, myPropertySets, players, myPlayerId, sendAction, onClose }: PlayRentModalProps) {
  const rc = rentCard as RentCard;
  const opponents = players.filter(p => p.id !== myPlayerId);

  // Determine eligible colors
  const eligibleColors: Color[] = rc.isWild
    ? myPropertySets.map(s => s.color)
    : rc.colors.filter(c => myPropertySets.some(s => s.color === c));

  const [chosenColor, setChosenColor] = useState<Color | null>(eligibleColors[0] ?? null);
  const [targetId, setTargetId] = useState<string>(opponents[0]?.id ?? '');
  const [doubleIds, setDoubleIds] = useState<string[]>([]);

  const doubleCards = hand.filter(c => c.type === 'action' && (c as ActionCard).action === 'doubleTheRent');

  const baseRent = chosenColor ? calcRent(myPropertySets, chosenColor) : 0;
  const multiplier = Math.pow(2, doubleIds.length);
  const finalRent = baseRent * multiplier;

  function toggleDouble(id: string) {
    setDoubleIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length < 2) return [...prev, id];
      return prev;
    });
  }

  function handleCharge() {
    if (!chosenColor) return;
    const action: GameAction = {
      type: 'PLAY_RENT',
      cardId: rentCard.id,
      chosenColor,
      targetId: rc.isWild ? targetId : undefined,
      doubleCardIds: doubleIds.length > 0 ? doubleIds : undefined,
    };
    sendAction(action);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rent-modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Charge Rent</h2>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="modal__body">
          {/* Color picker */}
          <div className="rent-modal__section">
            <label className="rent-modal__label">Choose color to charge rent for:</label>
            <div className="rent-modal__colors">
              {eligibleColors.length === 0 && (
                <p className="rent-modal__empty">You don't have properties in the eligible colors for this rent card.</p>
              )}
              {eligibleColors.map(c => {
                const rent = calcRent(myPropertySets, c);
                const set = myPropertySets.find(s => s.color === c)!;
                const setSize = SET_SIZES[c];
                return (
                  <button
                    key={c}
                    className={['rent-modal__color-btn', chosenColor === c ? 'rent-modal__color-btn--selected' : ''].join(' ')}
                    style={{ borderColor: COLOR_MAP[c], backgroundColor: chosenColor === c ? COLOR_MAP[c] + '33' : undefined }}
                    onClick={() => setChosenColor(c)}
                  >
                    <span className="rent-modal__color-dot" style={{ backgroundColor: COLOR_MAP[c] }} />
                    <span>{colorLabel(c)}</span>
                    <span className="rent-modal__color-count">{set.cards.length}/{setSize}</span>
                    <span className="rent-modal__color-rent">${rent}M</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Wild rent: target picker */}
          {rc.isWild && (
            <div className="rent-modal__section">
              <label className="rent-modal__label">Charge which opponent?</label>
              <select
                className="rent-modal__select"
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
              >
                {opponents.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Double the Rent */}
          {doubleCards.length > 0 && (
            <div className="rent-modal__section">
              <label className="rent-modal__label">Add Double the Rent? (uses 1 play each)</label>
              <div className="rent-modal__doubles">
                {doubleCards.map((card, i) => (
                  <label key={card.id} className="rent-modal__double-item">
                    <input
                      type="checkbox"
                      checked={doubleIds.includes(card.id)}
                      onChange={() => toggleDouble(card.id)}
                      disabled={!doubleIds.includes(card.id) && doubleIds.length >= 2}
                    />
                    <span>Double the Rent #{i + 1} (×2{doubleIds.length > 1 && i === 1 ? ' again = ×4' : ''})</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="rent-modal__summary">
            {chosenColor && (
              <p>
                Base rent for {colorLabel(chosenColor)}: <strong>${baseRent}M</strong>
                {doubleIds.length > 0 && <> × {multiplier} = <strong>${finalRent}M</strong></>}
              </p>
            )}
          </div>
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn--primary"
            disabled={!chosenColor || eligibleColors.length === 0}
            onClick={handleCharge}
          >
            Charge ${finalRent}M Rent
          </button>
        </div>
      </div>
    </div>
  );
}
