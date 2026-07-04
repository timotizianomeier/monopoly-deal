/**
 * Dev-only card gallery — open http://localhost:5173/gallery.html while the
 * dev server is running to eyeball every card design at once.
 * Not part of the production build (vite only builds index.html).
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { buildDeck } from '@monopoly-deal/shared';
import type { Card } from '@monopoly-deal/shared';
import CardView from './components/CardView';
import './styles/index.css';

const deck = buildDeck();
const seen = new Set<string>();
const unique: Card[] = [];
for (const card of deck) {
  // one of each distinct design (strip the per-copy counter from the id)
  const key = card.id.replace(/_\d+$/, '');
  if (!seen.has(key)) {
    seen.add(key);
    unique.push(card);
  }
}

const groups: { title: string; cards: Card[] }[] = [
  { title: 'Money', cards: unique.filter(c => c.type === 'money') },
  { title: 'Actions', cards: unique.filter(c => c.type === 'action') },
  { title: 'Rent', cards: unique.filter(c => c.type === 'rent') },
  { title: 'Wildcards', cards: unique.filter(c => c.type === 'wildcard') },
  { title: 'Properties', cards: unique.filter(c => c.type === 'property') },
];

function Gallery() {
  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {groups.map(g => (
        <section key={g.title}>
          <h2 style={{ marginBottom: '0.5rem' }}>{g.title}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-start' }}>
            {g.cards.map(c => <CardView key={c.id} card={c} />)}
          </div>
        </section>
      ))}
      <section>
        <h2 style={{ marginBottom: '0.5rem' }}>Sizes + face down</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-start' }}>
          <CardView card={unique[0]!} size="normal" />
          <CardView card={unique.find(c => c.type === 'property')!} size="small" />
          <CardView card={unique.find(c => c.type === 'property')!} size="tiny" />
          <CardView card={unique.find(c => c.type === 'action')!} size="tiny" />
          <CardView card={unique[0]!} faceDown />
        </div>
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Gallery />);
