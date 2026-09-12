import React, { useState, useMemo, useEffect } from 'react';
import type { PendingInteraction, Card, RedactedPlayerView, PropertySet } from '@monopoly-deal/shared';
import type { GameAction } from '@monopoly-deal/shared';
import CardView from './CardView.js';

interface PaymentPromptProps {
  interaction: PendingInteraction;
  myPlayerId: string;
  myBank: Card[];
  myPropertySets: PropertySet[];
  cardMap: Record<string, Card>;
  players: RedactedPlayerView[];
  sendAction: (action: GameAction) => void;
}

export default function PaymentPrompt({
  interaction,
  myPlayerId,
  myBank,
  myPropertySets,
  cardMap,
  players,
  sendAction,
}: PaymentPromptProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!interaction.expiresAt) { setSecondsLeft(null); return; }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((interaction.expiresAt! - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [interaction.expiresAt]);

  const myDebt = interaction.debts.find(d => d.debtorId === myPlayerId);
  if (!myDebt || myDebt.paid) return null;

  const amountOwed = myDebt.amountOwed;
  const recipientName = players.find(p => p.id === interaction.recipientId)?.name ?? 'the bank';

  // Property cards I can use for payment ($0 multi-color wildcards are never accepted)
  const myPropertyCards: Card[] = [];
  const myBuildingCards: Card[] = [];
  for (const set of myPropertySets) {
    for (const cardId of set.cards) {
      const card = cardMap[cardId];
      if (card && !(card.type === 'wildcard' && card.isMultiColor)) myPropertyCards.push(card);
    }
    for (const id of [set.houseCardId, set.hotelCardId]) {
      const card = id ? cardMap[id] : undefined;
      if (card) myBuildingCards.push(card);
    }
  }

  const allPaymentCards = [...myBank, ...myBuildingCards, ...myPropertyCards];
  const totalAssets = allPaymentCards.reduce((s, c) => s + c.bankValue, 0);

  const selectedTotal = useMemo(() => {
    return allPaymentCards
      .filter(c => selectedIds.has(c.id))
      .reduce((s, c) => s + c.bankValue, 0);
  }, [selectedIds, allPaymentCards]);

  const canPay = selectedTotal >= amountOwed || (totalAssets <= amountOwed && selectedIds.size === allPaymentCards.length);
  const isOverpaying = selectedTotal > amountOwed;
  const cantCover = totalAssets < amountOwed;

  function toggleCard(cardId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(allPaymentCards.map(c => c.id)));
  }

  function handlePay() {
    const cardIds = cantCover ? allPaymentCards.map(c => c.id) : Array.from(selectedIds);
    sendAction({ type: 'PAY', cardIds });
  }

  return (
    <div className="modal-overlay">
      <div className="modal payment-prompt">
        <div className="modal__header">
          <h2>Payment Required</h2>
        </div>
        <div className="modal__body">
          <p className="payment-prompt__debt">
            You owe <strong>${amountOwed}M</strong> to <strong>{recipientName}</strong>
          </p>
          {secondsLeft !== null && (
            <p className="payment-prompt__timer">
              {secondsLeft}s left — after that the cheapest sufficient cards are paid automatically
            </p>
          )}

          {cantCover && (
            <div className="payment-prompt__alert payment-prompt__alert--warning">
              You can't cover the full amount — you'll pay everything you have (${totalAssets}M).
            </div>
          )}

          {!cantCover && (
            <>
              <div className="payment-prompt__section">
                <div className="payment-prompt__section-header">
                  <span>Bank Cards</span>
                  <button className="btn btn--tiny" onClick={selectAll}>Select All</button>
                </div>
                <div className="payment-prompt__cards">
                  {myBank.length === 0 && <span className="payment-prompt__empty">No bank cards</span>}
                  {myBank.map(card => (
                    <label key={card.id} className={['payment-prompt__card-item', selectedIds.has(card.id) ? 'payment-prompt__card-item--selected' : ''].join(' ')}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(card.id)}
                        onChange={() => toggleCard(card.id)}
                      />
                      <CardView card={card} size="small" selected={selectedIds.has(card.id)} />
                      <span className="payment-prompt__card-value">${card.bankValue}M</span>
                    </label>
                  ))}
                </div>
              </div>

              {[...myBuildingCards, ...myPropertyCards].length > 0 && (
                <div className="payment-prompt__section">
                  <div className="payment-prompt__section-header">
                    <span>Properties &amp; buildings</span>
                  </div>
                  <div className="payment-prompt__cards">
                    {[...myBuildingCards, ...myPropertyCards].map(card => (
                      <label key={card.id} className={['payment-prompt__card-item', selectedIds.has(card.id) ? 'payment-prompt__card-item--selected' : ''].join(' ')}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(card.id)}
                          onChange={() => toggleCard(card.id)}
                        />
                        <CardView card={card} size="small" selected={selectedIds.has(card.id)} />
                        <span className="payment-prompt__card-value">${card.bankValue}M</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className={['payment-prompt__total', selectedTotal >= amountOwed ? 'payment-prompt__total--ok' : 'payment-prompt__total--low'].join(' ')}>
            Selected: ${cantCover ? totalAssets : selectedTotal}M / ${amountOwed}M required
          </div>
          {isOverpaying && !cantCover && (
            <div className="payment-prompt__alert">⚠ No change given — you'll overpay by ${selectedTotal - amountOwed}M</div>
          )}
        </div>
        <div className="modal__footer">
          <button
            className="btn btn--primary"
            disabled={!cantCover && !canPay}
            onClick={handlePay}
          >
            {cantCover ? `Pay Everything ($${totalAssets}M)` : `Pay $${Math.min(selectedTotal, amountOwed)}M`}
          </button>
        </div>
      </div>
    </div>
  );
}
