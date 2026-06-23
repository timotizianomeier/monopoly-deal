import React from 'react';
import type { RedactedPlayerView, Card } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import { COLOR_MAP, colorLabel } from './CardView.js';

interface OpponentViewProps {
  player: RedactedPlayerView;
  cardMap: Record<string, Card>;
  compact?: boolean;
}

export default function OpponentView({ player, cardMap, compact = false }: OpponentViewProps) {
  const bankTotal = player.bank.reduce((s, c) => s + c.bankValue, 0);
  const completeSets = player.propertySets.filter(s => s.cards.length >= SET_SIZES[s.color]).length;

  return (
    <div className={['opponent-view', player.isCurrentPlayer ? 'opponent-view--active' : '', !player.connected ? 'opponent-view--disconnected' : ''].filter(Boolean).join(' ')}>
      <div className="opponent-view__header">
        <span className="opponent-view__name">{player.name}</span>
        {player.isCurrentPlayer && <span className="opponent-view__turn-badge">THEIR TURN</span>}
        {!player.connected && <span className="opponent-view__disconnected-badge">⚡ DISCONNECTED</span>}
      </div>

      <div className="opponent-view__stats">
        <div className="opponent-view__stat">
          <span className="opponent-view__stat-label">Hand</span>
          <div className="opponent-view__hand-icons">
            {Array.from({ length: Math.min(player.handCount, 8) }).map((_, i) => (
              <div key={i} className="card-back-mini" />
            ))}
            {player.handCount > 8 && <span className="opponent-view__hand-overflow">+{player.handCount - 8}</span>}
          </div>
          <span className="opponent-view__stat-value">{player.handCount}</span>
        </div>
        <div className="opponent-view__stat">
          <span className="opponent-view__stat-label">Bank</span>
          <span className="opponent-view__stat-value">${bankTotal}M</span>
        </div>
        <div className="opponent-view__stat">
          <span className="opponent-view__stat-label">Sets</span>
          <span className="opponent-view__stat-value">{completeSets} ✓</span>
        </div>
      </div>

      {!compact && (
        <div className="opponent-view__sets">
          {player.propertySets.map(set => {
            const setSize = SET_SIZES[set.color];
            const isComplete = set.cards.length >= setSize;
            const bgColor = COLOR_MAP[set.color];
            return (
              <div
                key={set.color}
                className={['opponent-set', isComplete ? 'opponent-set--complete' : ''].join(' ')}
                style={{ borderColor: bgColor }}
                title={`${colorLabel(set.color)}: ${set.cards.length}/${setSize}`}
              >
                <div className="opponent-set__header" style={{ backgroundColor: bgColor }}>
                  <span className="opponent-set__label">{colorLabel(set.color)}</span>
                  <span className="opponent-set__count">{set.cards.length}/{setSize}</span>
                </div>
                <div className="opponent-set__cards">
                  {set.cards.map(id => {
                    const card = cardMap[id];
                    return (
                      <div key={id} className="opponent-set__card-chip">
                        {card?.type === 'property' ? card.name.split(' ').pop() :
                         card?.type === 'wildcard' ? 'Wild' : '?'}
                      </div>
                    );
                  })}
                  {set.hasHouse && <span title="House">🏠</span>}
                  {set.hasHotel && <span title="Hotel">🏨</span>}
                </div>
              </div>
            );
          })}
          {player.propertySets.length === 0 && (
            <span className="opponent-view__no-props">No properties</span>
          )}
        </div>
      )}
    </div>
  );
}
