import React, { useState } from 'react';
import type { Card, RedactedPlayerView, PropertySet } from '@monopoly-deal/shared';
import type { GameAction } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import CardView from './CardView.js';

interface ForcedDealModalProps {
  forcedDealCard: Card;
  players: RedactedPlayerView[];
  myPlayerId: string;
  myPropertySets: PropertySet[];
  cardMap: Record<string, Card>;
  sendAction: (action: GameAction) => void;
  onClose: () => void;
}

function stealableCards(sets: PropertySet[], cardMap: Record<string, Card>): Card[] {
  const result: Card[] = [];
  for (const set of sets) {
    if (set.cards.length >= SET_SIZES[set.color]) continue;
    for (const id of set.cards) {
      const c = cardMap[id];
      if (c) result.push(c);
    }
  }
  return result;
}

export default function ForcedDealModal({ forcedDealCard, players, myPlayerId, myPropertySets, cardMap, sendAction, onClose }: ForcedDealModalProps) {
  const opponents = players.filter(p => p.id !== myPlayerId);
  const [targetId, setTargetId] = useState<string>(opponents[0]?.id ?? '');
  const [theirCardId, setTheirCardId] = useState<string | null>(null);
  const [myCardId, setMyCardId] = useState<string | null>(null);

  const target = players.find(p => p.id === targetId);
  const theirCards = target ? stealableCards(target.propertySets, cardMap) : [];
  const myCards = stealableCards(myPropertySets, cardMap);

  function handleTargetChange(id: string) {
    setTargetId(id);
    setTheirCardId(null);
  }

  function handleSwap() {
    if (!theirCardId || !myCardId) return;
    sendAction({
      type: 'PLAY_FORCED_DEAL',
      cardId: forcedDealCard.id,
      targetId,
      targetCardId: theirCardId,
      myCardId,
    });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal forced-deal-modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Forced Deal — Swap Properties</h2>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="modal__body">
          <div className="forced-deal-modal__section">
            <label>Choose opponent:</label>
            <select
              className="forced-deal-modal__select"
              value={targetId}
              onChange={e => handleTargetChange(e.target.value)}
            >
              {opponents.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="forced-deal-modal__section">
            <label>Their property to take (not from complete sets):</label>
            <div className="forced-deal-modal__cards">
              {theirCards.length === 0 && <p className="forced-deal-modal__empty">No stealable properties</p>}
              {theirCards.map(card => (
                <div
                  key={card.id}
                  className={['forced-deal-modal__card', theirCardId === card.id ? 'forced-deal-modal__card--selected' : ''].join(' ')}
                  onClick={() => setTheirCardId(card.id)}
                >
                  <CardView card={card} size="small" selected={theirCardId === card.id} />
                </div>
              ))}
            </div>
          </div>

          <div className="forced-deal-modal__section">
            <label>Your property to give (not from complete sets):</label>
            <div className="forced-deal-modal__cards">
              {myCards.length === 0 && <p className="forced-deal-modal__empty">No tradeable properties</p>}
              {myCards.map(card => (
                <div
                  key={card.id}
                  className={['forced-deal-modal__card', myCardId === card.id ? 'forced-deal-modal__card--selected' : ''].join(' ')}
                  onClick={() => setMyCardId(card.id)}
                >
                  <CardView card={card} size="small" selected={myCardId === card.id} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn--primary"
            disabled={!theirCardId || !myCardId}
            onClick={handleSwap}
          >
            Swap Cards
          </button>
        </div>
      </div>
    </div>
  );
}
