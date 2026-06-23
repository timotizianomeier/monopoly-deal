import React from 'react';
import type { Card, Color, WildcardCard, RentCard, ActionCard } from '@monopoly-deal/shared';
import CardView from './CardView.js';

interface HandViewProps {
  cards: Card[];
  isMyTurn: boolean;
  isPlayingPhase: boolean;
  playsRemaining: number;
  onPlayCard: (card: Card, destination?: Color) => void;
  onBankCard: (card: Card) => void;
  onSelectForModal: (card: Card) => void;
}

/**
 * Determines valid colors a card can be played to as property.
 */
function getPropertyColors(card: Card): Color[] {
  if (card.type === 'property') return [card.color];
  if (card.type === 'wildcard') return (card as WildcardCard).colors;
  return [];
}

function isActionBankable(card: Card): boolean {
  // All non-JSN action cards can be banked; JSN cannot be played during own turn for banking
  return card.type !== 'action' || (card as ActionCard).action !== 'justSayNo';
}

export default function HandView({
  cards,
  isMyTurn,
  isPlayingPhase,
  playsRemaining,
  onPlayCard,
  onBankCard,
  onSelectForModal,
}: HandViewProps) {
  const canPlay = isMyTurn && isPlayingPhase && playsRemaining > 0;

  if (cards.length === 0) {
    return (
      <div className="hand-view hand-view--empty">
        <span className="hand-view__empty-msg">No cards in hand</span>
      </div>
    );
  }

  function handleCardClick(card: Card) {
    if (!canPlay) return;

    switch (card.type) {
      case 'money':
        // Money can only be banked
        onBankCard(card);
        break;

      case 'property': {
        // Single color — play directly to property
        onPlayCard(card, card.color);
        break;
      }

      case 'wildcard': {
        const wc = card as WildcardCard;
        if (wc.isMultiColor || wc.colors.length > 1) {
          // Open color picker modal
          onSelectForModal(card);
        } else {
          onPlayCard(card, wc.colors[0]);
        }
        break;
      }

      case 'rent': {
        const rc = card as RentCard;
        if (rc.isWild || rc.colors.length === 2) {
          // Open rent modal
          onSelectForModal(card);
        } else {
          onSelectForModal(card);
        }
        break;
      }

      case 'action': {
        const ac = card as ActionCard;
        switch (ac.action) {
          case 'passGo':
          case 'birthday':
            onPlayCard(card);
            break;
          case 'doubleTheRent':
            // Can't play standalone — show info
            break;
          default:
            onSelectForModal(card);
        }
        break;
      }
    }
  }

  return (
    <div className="hand-view">
      <div className="hand-view__cards">
        {cards.map(card => {
          const isDisabled = !canPlay || card.type === 'action' && (card as ActionCard).action === 'doubleTheRent' || card.type === 'action' && (card as ActionCard).action === 'justSayNo';
          return (
            <div key={card.id} className="hand-view__card-wrapper">
              <CardView
                card={card}
                onClick={() => handleCardClick(card)}
                disabled={isDisabled}
              />
              {canPlay && !isDisabled && (
                <div className="hand-view__card-actions">
                  {card.type === 'money' && (
                    <button className="btn btn--tiny" onClick={() => onBankCard(card)}>
                      Bank ${(card as import('@monopoly-deal/shared').MoneyCard).value}M
                    </button>
                  )}
                  {(card.type === 'property' || card.type === 'wildcard') && (
                    <button className="btn btn--tiny" onClick={() => handleCardClick(card)}>
                      Play
                    </button>
                  )}
                  {(card.type === 'rent' || (card.type === 'action' && isActionBankable(card))) && (
                    <>
                      <button className="btn btn--tiny" onClick={() => handleCardClick(card)}>
                        Play
                      </button>
                      <button className="btn btn--tiny btn--secondary" onClick={() => onBankCard(card)}>
                        Bank
                      </button>
                    </>
                  )}
                </div>
              )}
              {card.type === 'action' && (card as ActionCard).action === 'doubleTheRent' && (
                <div className="hand-view__card-hint">Use with rent</div>
              )}
              {card.type === 'action' && (card as ActionCard).action === 'justSayNo' && (
                <div className="hand-view__card-hint">Counter action</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
