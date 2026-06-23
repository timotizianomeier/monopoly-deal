import React, { useState, useEffect } from 'react';
import type { PendingInteraction, Card, ActionCard, RedactedPlayerView } from '@monopoly-deal/shared';
import type { GameAction } from '@monopoly-deal/shared';
import CardView from './CardView.js';

interface JsnPromptProps {
  interaction: PendingInteraction;
  myPlayerId: string;
  myHand: Card[];
  players: RedactedPlayerView[];
  sendAction: (action: GameAction) => void;
}

export default function JsnPrompt({ interaction, myPlayerId, myHand, players, sendAction }: JsnPromptProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(30);

  useEffect(() => {
    if (!interaction.expiresAt) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((interaction.expiresAt! - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [interaction.expiresAt]);

  const jsnCards = myHand.filter(
    c => c.type === 'action' && (c as ActionCard).action === 'justSayNo'
  );

  const initiatorName = players.find(p => p.id === interaction.initiatorId)?.name ?? 'Someone';

  // Determine the context of this prompt
  const myJsnState = interaction.targetJsnStates?.find(s => s.targetId === myPlayerId);
  const isCounterJsn = myJsnState?.awaitingFrom === 'initiator' || interaction.awaitingJsnFrom?.includes(interaction.initiatorId);
  const isTarget = interaction.awaitingJsnFrom?.includes(myPlayerId) || myJsnState?.awaitingFrom === 'target';

  const pendingAction = interaction.pendingAction;
  let description = 'An action is pending against you.';
  if (pendingAction) {
    switch (pendingAction.type) {
      case 'PLAY_SLY_DEAL': description = `${initiatorName} is playing Sly Deal to steal your property!`; break;
      case 'PLAY_DEAL_BREAKER': description = `${initiatorName} is playing Deal Breaker to steal your complete set!`; break;
      case 'PLAY_FORCED_DEAL': description = `${initiatorName} wants to swap one of your properties!`; break;
      case 'PLAY_RENT': description = `${initiatorName} is charging you rent!`; break;
      case 'PLAY_DEBT_COLLECTOR': description = `${initiatorName} is using Debt Collector on you — $5M!`; break;
      case 'PLAY_BIRTHDAY': description = `${initiatorName} is celebrating their birthday — you owe $2M!`; break;
      default: description = `${initiatorName} played an action against you.`;
    }
  }

  function handleJsn(cardId: string) {
    sendAction({ type: 'RESPOND_JUST_SAY_NO', cardId });
  }

  function handleAllow() {
    sendAction({ type: 'RESPOND_ALLOW' });
  }

  const timerPct = interaction.expiresAt
    ? Math.max(0, Math.min(100, (secondsLeft / 30) * 100))
    : 100;

  return (
    <div className="modal-overlay">
      <div className="modal jsn-prompt">
        <div className="modal__header">
          <h2>{isCounterJsn ? 'Counter Just Say No?' : 'Just Say No?'}</h2>
        </div>
        <div className="modal__body">
          {isCounterJsn ? (
            <p>Someone played Just Say No against your action! Do you want to counter with another Just Say No?</p>
          ) : (
            <p>{description}</p>
          )}

          {interaction.expiresAt && (
            <div className="jsn-timer">
              <div className="jsn-timer__bar">
                <div className="jsn-timer__fill" style={{ width: `${timerPct}%`, backgroundColor: secondsLeft < 10 ? '#e74c3c' : '#f5c518' }} />
              </div>
              <span className="jsn-timer__text">{secondsLeft}s remaining</span>
            </div>
          )}

          {(isTarget || isCounterJsn) && jsnCards.length > 0 && (
            <div className="jsn-prompt__cards">
              <p className="jsn-prompt__label">Your Just Say No cards:</p>
              <div className="jsn-prompt__card-list">
                {jsnCards.map(card => (
                  <button key={card.id} className="jsn-prompt__card-btn" onClick={() => handleJsn(card.id)}>
                    <CardView card={card} size="small" />
                    <span>Play this</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal__footer">
          {(isTarget || isCounterJsn) && jsnCards.length > 0 && jsnCards[0] && (
            <button className="btn btn--danger" onClick={() => handleJsn(jsnCards[0]!.id)}>
              Just Say No!
            </button>
          )}
          <button className="btn btn--secondary" onClick={handleAllow}>
            {isCounterJsn ? 'Back Down (Allow)' : 'Allow'}
          </button>
        </div>
      </div>
    </div>
  );
}
