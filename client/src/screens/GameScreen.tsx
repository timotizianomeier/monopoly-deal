import React, { useState, useCallback } from 'react';
import type {
  Card,
  Color,
  ActionCard,
  RentCard,
  WildcardCard,
  RedactedGameView,
} from '@monopoly-deal/shared';
import type { SocketHook } from '../socket/useSocket.js';

import HandView from '../components/HandView.js';
import PropertySetsView from '../components/PropertySetsView.js';
import BankView from '../components/BankView.js';
import OpponentView from '../components/OpponentView.js';
import ActionLog from '../components/ActionLog.js';
import CardView from '../components/CardView.js';
import JsnPrompt from '../components/JsnPrompt.js';
import PaymentPrompt from '../components/PaymentPrompt.js';
import DiscardPrompt from '../components/DiscardPrompt.js';
import PlayRentModal from '../components/PlayRentModal.js';
import SlyDealModal from '../components/SlyDealModal.js';
import ForcedDealModal from '../components/ForcedDealModal.js';
import DealBreakerModal from '../components/DealBreakerModal.js';
import PropertyPlayModal from '../components/PropertyPlayModal.js';
import RoundOverModal from './RoundOverModal.js';

interface GameScreenProps {
  socket: SocketHook;
}

type ActiveModal =
  | { type: 'propertyPlay'; card: Card }
  | { type: 'rent'; card: Card }
  | { type: 'slyDeal'; card: Card }
  | { type: 'forcedDeal'; card: Card }
  | { type: 'dealBreaker'; card: Card }
  | { type: 'targetPicker'; card: Card; action: 'debtCollector' | 'birthday' }
  | null;

export default function GameScreen({ socket }: GameScreenProps) {
  const { gameView, gameOver, playerId, sendAction, error, clearError } = socket;
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Show error as toast
  React.useEffect(() => {
    if (error) {
      setToastMsg(error);
      const t = setTimeout(() => { setToastMsg(null); clearError(); }, 4000);
      return () => clearTimeout(t);
    }
  }, [error, clearError]);

  if (!gameView) {
    return (
      <div className="game-screen game-screen--loading">
        <div className="game-screen__loading">Loading game...</div>
      </div>
    );
  }

  const { phase, myPlayerId, players, currentPlayerIndex, playsRemaining, deck, discardTop, pendingInteraction, actionLog, winnerId } = gameView;
  const me = players.find(p => p.id === myPlayerId)!;
  const opponents = players.filter(p => p.id !== myPlayerId);
  const currentPlayer = players[currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === myPlayerId;
  const myHand = me?.hand ?? [];
  const decision = gameView.yourPendingDecision;

  // Build a card map from all visible cards
  const cardMap: Record<string, Card> = {};
  for (const p of players) {
    for (const c of p.bank) cardMap[c.id] = c;
    if (p.hand) for (const c of p.hand) cardMap[c.id] = c;
    for (const set of p.propertySets) {
      for (const id of set.cards) {
        // cards in property sets come from the view; we might not have the card object here
        // The server sends card objects in bank and hand; for property sets we reconstruct from cardMap
      }
    }
    if (discardTop) cardMap[discardTop.id] = discardTop;
  }
  // Also populate from the opponent views (bank cards are Card objects)
  for (const p of players) {
    for (const set of p.propertySets) {
      // property set card objects aren't in the view; we attempt to map from bank/hand context
      // The card objects for properties will be in hands or we need to track them
      // For opponent property views, we store a placeholder
    }
  }

  // ---------------------------------------------------------------------------
  // Build an enhanced cardMap: opponents' property cards are sent as Card objects
  // in their bank arrays; we need to also build from property sets.
  // The server's RedactedPlayerView has bank: Card[] but property set cards
  // are referenced by ID only. We need to find them somewhere.
  // For now we use whatever cards we have in the map.
  // ---------------------------------------------------------------------------

  function handlePlayCard(card: Card, destination?: Color) {
    sendAction({ type: 'PLAY_PROPERTY', cardId: card.id, setColor: destination! });
  }

  function handleBankCard(card: Card) {
    sendAction({ type: 'PLAY_MONEY', cardId: card.id });
  }

  function handleSelectForModal(card: Card) {
    switch (card.type) {
      case 'wildcard':
        setActiveModal({ type: 'propertyPlay', card });
        break;
      case 'rent':
        setActiveModal({ type: 'rent', card });
        break;
      case 'action': {
        const ac = card as ActionCard;
        switch (ac.action) {
          case 'slyDeal':
            setActiveModal({ type: 'slyDeal', card });
            break;
          case 'forcedDeal':
            setActiveModal({ type: 'forcedDeal', card });
            break;
          case 'dealBreaker':
            setActiveModal({ type: 'dealBreaker', card });
            break;
          case 'debtCollector':
            setActiveModal({ type: 'targetPicker', card, action: 'debtCollector' });
            break;
          case 'birthday':
            // Birthday charges everyone automatically
            sendAction({ type: 'PLAY_BIRTHDAY', cardId: card.id });
            break;
          case 'house':
            setActiveModal({ type: 'propertyPlay', card }); // re-use for set picking
            break;
          case 'hotel':
            setActiveModal({ type: 'propertyPlay', card });
            break;
          default:
            break;
        }
        break;
      }
      default:
        break;
    }
  }

  function handlePropertyPlay(color: Color) {
    if (!activeModal) return;
    const card = activeModal.card;
    if (card.type === 'action') {
      const ac = card as ActionCard;
      if (ac.action === 'house') {
        sendAction({ type: 'PLAY_HOUSE', cardId: card.id, setColor: color });
      } else if (ac.action === 'hotel') {
        sendAction({ type: 'PLAY_HOTEL', cardId: card.id, setColor: color });
      }
    } else {
      sendAction({ type: 'PLAY_PROPERTY', cardId: card.id, setColor: color });
    }
    setActiveModal(null);
  }

  function handleDrawCards() {
    sendAction({ type: 'START_TURN' });
  }

  function handleEndTurn() {
    sendAction({ type: 'END_TURN' });
  }

  // ---------------------------------------------------------------------------
  // JSN Prompt
  // ---------------------------------------------------------------------------
  const showJsnPrompt =
    pendingInteraction?.type === 'JSN_WINDOW' &&
    decision?.type === 'respondJSN';

  // ---------------------------------------------------------------------------
  // Payment Prompt
  // ---------------------------------------------------------------------------
  const showPaymentPrompt =
    pendingInteraction?.type === 'PAYMENT' &&
    decision?.type === 'pay';

  // ---------------------------------------------------------------------------
  // Discard Prompt
  // ---------------------------------------------------------------------------
  const showDiscardPrompt =
    phase === 'AWAITING_DISCARD' &&
    decision?.type === 'discard' &&
    isMyTurn;

  // ---------------------------------------------------------------------------
  // Target picker for Debt Collector
  // ---------------------------------------------------------------------------
  function TargetPickerModal() {
    if (activeModal?.type !== 'targetPicker') return null;
    const card = activeModal.card;
    return (
      <div className="modal-overlay" onClick={() => setActiveModal(null)}>
        <div className="modal target-picker-modal" onClick={e => e.stopPropagation()}>
          <div className="modal__header">
            <h2>Choose Target — Debt Collector ($5M)</h2>
            <button className="modal__close" onClick={() => setActiveModal(null)}>✕</button>
          </div>
          <div className="modal__body">
            <div className="target-picker-modal__players">
              {opponents.map(p => (
                <button
                  key={p.id}
                  className="btn btn--primary target-picker-modal__player-btn"
                  onClick={() => {
                    sendAction({ type: 'PLAY_DEBT_COLLECTOR', cardId: card.id, targetId: p.id });
                    setActiveModal(null);
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="modal__footer">
            <button className="btn btn--secondary" onClick={() => setActiveModal(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Layout helpers: position opponents around the table
  // ---------------------------------------------------------------------------
  const topOpponents = opponents.slice(0, Math.min(opponents.length, 2));
  const sideOpponents = opponents.slice(2);
  const leftOpponents = sideOpponents.filter((_, i) => i % 2 === 0);
  const rightOpponents = sideOpponents.filter((_, i) => i % 2 === 1);

  const phaseLabel: Record<string, string> = {
    WAITING: 'Waiting to start',
    AWAITING_TURN_START: 'Draw cards to begin turn',
    PLAYING: 'Playing',
    AWAITING_DISCARD: 'Discard down to 7',
    AWAITING_RESPONSES: 'Waiting for responses',
    AWAITING_PAYMENT: 'Awaiting payment',
    FINISHED: 'Game finished',
  };

  return (
    <div className="game-screen">
      {/* Toast error */}
      {toastMsg && (
        <div className="toast toast--error">
          {toastMsg}
          <button onClick={() => { setToastMsg(null); clearError(); }}>✕</button>
        </div>
      )}

      {/* Game Over Modal */}
      {gameOver && (
        <RoundOverModal gameOver={gameOver} socket={socket} />
      )}

      {/* JSN Prompt */}
      {showJsnPrompt && pendingInteraction && (
        <JsnPrompt
          interaction={pendingInteraction}
          myPlayerId={myPlayerId}
          myHand={myHand}
          players={players}
          sendAction={sendAction}
        />
      )}

      {/* Payment Prompt */}
      {showPaymentPrompt && pendingInteraction && me && (
        <PaymentPrompt
          interaction={pendingInteraction}
          myPlayerId={myPlayerId}
          myBank={me.bank}
          myPropertySets={me.propertySets}
          cardMap={cardMap}
          players={players}
          sendAction={sendAction}
        />
      )}

      {/* Discard Prompt */}
      {showDiscardPrompt && (
        <DiscardPrompt
          hand={myHand}
          sendAction={sendAction}
        />
      )}

      {/* Active Modals */}
      {activeModal?.type === 'propertyPlay' && (
        <PropertyPlayModal
          card={activeModal.card}
          onPlay={handlePropertyPlay}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'rent' && me && (
        <PlayRentModal
          rentCard={activeModal.card}
          hand={myHand}
          myPropertySets={me.propertySets}
          players={players}
          myPlayerId={myPlayerId}
          sendAction={sendAction}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'slyDeal' && (
        <SlyDealModal
          slyDealCard={activeModal.card}
          players={players}
          myPlayerId={myPlayerId}
          cardMap={cardMap}
          sendAction={sendAction}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'forcedDeal' && me && (
        <ForcedDealModal
          forcedDealCard={activeModal.card}
          players={players}
          myPlayerId={myPlayerId}
          myPropertySets={me.propertySets}
          cardMap={cardMap}
          sendAction={sendAction}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'dealBreaker' && (
        <DealBreakerModal
          dealBreakerCard={activeModal.card}
          players={players}
          myPlayerId={myPlayerId}
          cardMap={cardMap}
          sendAction={sendAction}
          onClose={() => setActiveModal(null)}
        />
      )}

      <TargetPickerModal />

      {/* Main table layout */}
      <div className="game-table">
        {/* Top opponents */}
        <div className="game-table__top">
          {topOpponents.map(p => (
            <OpponentView key={p.id} player={p} cardMap={cardMap} />
          ))}
        </div>

        {/* Middle row: left sidebar + center + right sidebar */}
        <div className="game-table__middle">
          {/* Left opponents */}
          <div className="game-table__left">
            {leftOpponents.map(p => (
              <OpponentView key={p.id} player={p} cardMap={cardMap} compact />
            ))}
          </div>

          {/* Center panel */}
          <div className="game-table__center">
            <div className="center-panel">
              <div className="center-panel__info">
                <div className="center-panel__turn">
                  <span className="center-panel__turn-label">
                    {isMyTurn ? '🌟 Your turn' : `${currentPlayer?.name ?? '...'}'s turn`}
                  </span>
                </div>

                <div className="center-panel__phase">
                  <span className="center-panel__phase-label">{phaseLabel[phase] ?? phase}</span>
                </div>

                {isMyTurn && phase === 'PLAYING' && (
                  <div className="center-panel__plays">
                    <span className={playsRemaining === 0 ? 'center-panel__plays--zero' : ''}>
                      {playsRemaining} play{playsRemaining !== 1 ? 's' : ''} remaining
                    </span>
                  </div>
                )}
              </div>

              <div className="center-panel__piles">
                <div className="center-panel__pile">
                  <div className="pile pile--draw">
                    <span className="pile__count">{deck.count}</span>
                    <span className="pile__label">Draw</span>
                  </div>
                </div>
                <div className="center-panel__pile">
                  <div className="pile pile--discard">
                    {discardTop
                      ? <CardView card={discardTop} size="small" />
                      : <span className="pile__empty">Empty</span>}
                    <span className="pile__label">Discard</span>
                  </div>
                </div>
              </div>

              <ActionLog entries={actionLog} />
            </div>
          </div>

          {/* Right opponents */}
          <div className="game-table__right">
            {rightOpponents.map(p => (
              <OpponentView key={p.id} player={p} cardMap={cardMap} compact />
            ))}
          </div>
        </div>

        {/* Bottom — my area */}
        <div className="game-table__bottom">
          {!isMyTurn && (
            <div className="game-table__waiting-banner">
              Waiting for {currentPlayer?.name ?? '...'}...
            </div>
          )}

          <div className="my-area">
            {/* My bank + properties row */}
            <div className="my-area__table">
              <div className="my-area__bank">
                {me && <BankView cards={me.bank} />}
              </div>
              <div className="my-area__properties">
                {me && (
                  <PropertySetsView
                    sets={me.propertySets}
                    cardMap={cardMap}
                  />
                )}
              </div>
            </div>

            {/* My hand + controls */}
            <div className="my-area__hand-row">
              <div className="my-area__hand">
                {me && (
                  <HandView
                    cards={myHand}
                    isMyTurn={isMyTurn}
                    isPlayingPhase={phase === 'PLAYING'}
                    playsRemaining={playsRemaining}
                    onPlayCard={handlePlayCard}
                    onBankCard={handleBankCard}
                    onSelectForModal={handleSelectForModal}
                  />
                )}
              </div>

              <div className="my-area__controls">
                <div className="my-area__controls-name">{me?.name}</div>
                {isMyTurn && phase === 'AWAITING_TURN_START' && (
                  <button className="btn btn--primary btn--large" onClick={handleDrawCards}>
                    Draw Cards
                  </button>
                )}
                {isMyTurn && phase === 'PLAYING' && (
                  <button
                    className="btn btn--secondary btn--large"
                    onClick={handleEndTurn}
                  >
                    End Turn
                  </button>
                )}
                {!isMyTurn && (
                  <div className="my-area__controls-status">
                    {phase === 'AWAITING_RESPONSES' && 'Waiting for JSN...'}
                    {phase === 'AWAITING_PAYMENT' && 'Awaiting payment...'}
                    {(phase === 'PLAYING' || phase === 'AWAITING_TURN_START' || phase === 'AWAITING_DISCARD') && `${currentPlayer?.name}'s turn`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
