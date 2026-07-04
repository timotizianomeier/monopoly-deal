import React from 'react';

/**
 * Original SVG "sketch" illustrations for cards, drawn in a simple flat style
 * reminiscent of classic card-game art. All artwork is original — no assets
 * are copied from the physical game.
 */

interface ArtProps {
  className?: string;
}

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className ?? 'card-art'}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Small green house, in the spirit of a classic board-game house token. */
export function HouseArt({ className }: ArtProps) {
  return (
    <Svg className={className}>
      <path d="M8 24 L24 10 L40 24" stroke="#1b7a35" fill="none" />
      <path d="M12 22 V38 H36 V22" stroke="#1b7a35" fill="#2ecc71" fillOpacity="0.35" />
      <rect x="20" y="28" width="8" height="10" stroke="#1b7a35" fill="#fff" />
      <path d="M30 15 V10 H34 V18" stroke="#1b7a35" />
    </Svg>
  );
}

/** Tall red hotel building. */
export function HotelArt({ className }: ArtProps) {
  return (
    <Svg className={className}>
      <rect x="12" y="10" width="24" height="30" stroke="#a93226" fill="#e74c3c" fillOpacity="0.3" />
      <path d="M8 10 H40" stroke="#a93226" />
      <rect x="17" y="15" width="5" height="5" stroke="#a93226" />
      <rect x="26" y="15" width="5" height="5" stroke="#a93226" />
      <rect x="17" y="24" width="5" height="5" stroke="#a93226" />
      <rect x="26" y="24" width="5" height="5" stroke="#a93226" />
      <rect x="20" y="33" width="8" height="7" stroke="#a93226" fill="#fff" />
    </Svg>
  );
}

/** Arrow looping forward over a "GO" tile. */
export function PassGoArt({ className }: ArtProps) {
  return (
    <Svg className={className}>
      <rect x="10" y="24" width="28" height="16" rx="2" stroke="#c0392b" fill="#e74c3c" fillOpacity="0.2" />
      <text x="24" y="36" textAnchor="middle" fontSize="11" fontWeight="800" fill="#c0392b" stroke="none">GO</text>
      <path d="M12 18 C12 8, 36 8, 36 18" stroke="#2c3e50" />
      <path d="M31 14 L36 19 L41 13" stroke="#2c3e50" fill="none" />
    </Svg>
  );
}

/** Hammer cracking a bar — breaking a deal. */
export function DealBreakerArt({ className }: ArtProps) {
  return (
    <Svg className={className}>
      {/* cracked bar */}
      <path d="M8 34 H21 M27 34 H40" stroke="#7f8c8d" strokeWidth="4" />
      <path d="M21 34 L24 29 L24 39 L27 34" stroke="#7f8c8d" strokeWidth="2" fill="none" />
      {/* hammer */}
      <rect x="26" y="8" width="14" height="8" rx="2" transform="rotate(35 33 12)" stroke="#a93226" fill="#e74c3c" fillOpacity="0.35" />
      <path d="M28 18 L18 30" stroke="#8e5a2d" strokeWidth="3.5" />
      {/* impact sparks */}
      <path d="M14 26 L11 23 M16 22 L14 18 M11 30 L7 29" stroke="#f39c12" />
    </Svg>
  );
}

/** Speech bubble shouting NO. */
export function JustSayNoArt({ className }: ArtProps) {
  return (
    <Svg className={className}>
      <path d="M10 10 H38 A4 4 0 0 1 42 14 V28 A4 4 0 0 1 38 32 H22 L14 40 V32 H10 A4 4 0 0 1 6 28 V14 A4 4 0 0 1 10 10 Z" stroke="#c0392b" fill="#fff" />
      <text x="24" y="26" textAnchor="middle" fontSize="13" fontWeight="900" fill="#c0392b" stroke="none">NO!</text>
    </Svg>
  );
}

/** Masked thief peeking over a card being swiped away. */
export function SlyDealArt({ className }: ArtProps) {
  return (
    <Svg className={className}>
      {/* card being swiped */}
      <rect x="14" y="20" width="17" height="22" rx="2" transform="rotate(-10 22 31)" stroke="#2c3e50" fill="#ecf0f1" />
      {/* burglar head peeking from behind */}
      <circle cx="33" cy="16" r="8" stroke="#2c3e50" fill="#f5cba7" fillOpacity="0.7" />
      {/* domino mask */}
      <path d="M25.5 14 q7.5 -3.5 15 0 q-1.5 5 -6 4.5 q-1.5 -0.3 -1.5 -1.5 q0 1.2 -1.5 1.5 q-4.5 0.5 -6 -4.5 Z" stroke="#2c3e50" fill="#34495e" />
      <circle cx="30" cy="15.5" r="1.3" fill="#fff" stroke="none" />
      <circle cx="36" cy="15.5" r="1.3" fill="#fff" stroke="none" />
      {/* flat cap */}
      <path d="M25 11 q8 -6 16 0 l1.5 2 h-19 Z" stroke="#2c3e50" fill="#7f8c8d" />
      {/* motion swoosh */}
      <path d="M10 34 q-4 1 -6 4 M11 28 q-5 0 -8 2" stroke="#95a5a6" />
    </Svg>
  );
}

/** Two cards swapping with curved arrows. */
export function ForcedDealArt({ className }: ArtProps) {
  return (
    <Svg className={className}>
      <rect x="6" y="8" width="14" height="19" rx="2" stroke="#2980b9" fill="#3498db" fillOpacity="0.25" />
      <rect x="28" y="21" width="14" height="19" rx="2" stroke="#c0392b" fill="#e74c3c" fillOpacity="0.25" />
      <path d="M24 12 C32 10, 38 12, 40 16" stroke="#2c3e50" />
      <path d="M36 11 L40 16 L42 10" stroke="#2c3e50" fill="none" />
      <path d="M24 36 C16 38, 10 36, 8 32" stroke="#2c3e50" />
      <path d="M12 37 L8 32 L6 38" stroke="#2c3e50" fill="none" />
    </Svg>
  );
}

/** Money bag with a dollar sign. */
export function DebtCollectorArt({ className }: ArtProps) {
  return (
    <Svg className={className}>
      <path d="M20 12 L18 7 H30 L28 12" stroke="#7d6608" />
      <path d="M20 12 H28 C36 18, 38 26, 36 33 C34 39, 14 39, 12 33 C10 26, 12 18, 20 12 Z" stroke="#7d6608" fill="#f1c40f" fillOpacity="0.35" />
      <text x="24" y="31" textAnchor="middle" fontSize="14" fontWeight="800" fill="#7d6608" stroke="none">$</text>
    </Svg>
  );
}

/** Birthday cake with candles. */
export function BirthdayArt({ className }: ArtProps) {
  return (
    <Svg className={className}>
      <rect x="10" y="26" width="28" height="14" rx="2" stroke="#a04000" fill="#f5cba7" fillOpacity="0.6" />
      <path d="M10 30 q3.5 3 7 0 q3.5 3 7 0 q3.5 3 7 0 q3.5 3 7 0" stroke="#e74c3c" />
      <path d="M17 26 V18 M24 26 V16 M31 26 V18" stroke="#2c3e50" />
      <path d="M17 15 q1.5 2 0 3 q-1.5 -1 0 -3 M24 13 q1.5 2 0 3 q-1.5 -1 0 -3 M31 15 q1.5 2 0 3 q-1.5 -1 0 -3" stroke="#f39c12" fill="#f39c12" fillOpacity="0.6" />
    </Svg>
  );
}

/** Big ×2 with a rent tag. */
export function DoubleTheRentArt({ className }: ArtProps) {
  return (
    <Svg className={className}>
      <path d="M6 12 h11 l5 5 v12 h-16 Z" stroke="#16a085" fill="#1abc9c" fillOpacity="0.2" />
      <circle cx="11" cy="17" r="1.8" stroke="#16a085" />
      <text x="33" y="38" textAnchor="middle" fontSize="17" fontWeight="900" fill="#c0392b" stroke="none">×2</text>
    </Svg>
  );
}

/** Rent card art: circle split into two halves. */
export function RentCircle({ c1, c2 }: { c1: string; c2: string }) {
  return (
    <svg viewBox="0 0 48 48" className="card-art card-art--rent" aria-hidden="true">
      <circle cx="24" cy="24" r="19" fill="#fff" stroke="#2c3e50" strokeWidth="2" />
      <path d="M24 5 A19 19 0 0 1 24 43 Z" fill={c2} />
      <path d="M24 5 A19 19 0 0 0 24 43 Z" fill={c1} />
      <circle cx="24" cy="24" r="19" fill="none" stroke="#2c3e50" strokeWidth="2" />
      <circle cx="24" cy="24" r="8.5" fill="#fff" stroke="#2c3e50" strokeWidth="1.5" />
      <text x="24" y="28.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#2c3e50">$</text>
    </svg>
  );
}

/** Wild rent: circle of rainbow wedges. */
export function WildRentCircle({ colors }: { colors: string[] }) {
  const n = colors.length;
  const wedges = colors.map((c, i) => {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    const x0 = 24 + 19 * Math.cos(a0);
    const y0 = 24 + 19 * Math.sin(a0);
    const x1 = 24 + 19 * Math.cos(a1);
    const y1 = 24 + 19 * Math.sin(a1);
    return <path key={i} d={`M24 24 L${x0} ${y0} A19 19 0 0 1 ${x1} ${y1} Z`} fill={c} />;
  });
  return (
    <svg viewBox="0 0 48 48" className="card-art card-art--rent" aria-hidden="true">
      {wedges}
      <circle cx="24" cy="24" r="19" fill="none" stroke="#2c3e50" strokeWidth="2" />
      <circle cx="24" cy="24" r="8.5" fill="#fff" stroke="#2c3e50" strokeWidth="1.5" />
      <text x="24" y="28.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#2c3e50">$</text>
    </svg>
  );
}

export const ACTION_ART: Record<string, (props: ArtProps) => React.JSX.Element> = {
  dealBreaker: DealBreakerArt,
  justSayNo: JustSayNoArt,
  slyDeal: SlyDealArt,
  forcedDeal: ForcedDealArt,
  debtCollector: DebtCollectorArt,
  birthday: BirthdayArt,
  doubleTheRent: DoubleTheRentArt,
  house: HouseArt,
  hotel: HotelArt,
  passGo: PassGoArt,
};

/** Accent color used for each action card's title banner. */
export const ACTION_ACCENT: Record<string, string> = {
  dealBreaker: '#c0392b',
  justSayNo: '#2980b9',
  slyDeal: '#8e44ad',
  forcedDeal: '#d35400',
  debtCollector: '#7d6608',
  birthday: '#e91e63',
  doubleTheRent: '#16a085',
  house: '#1b7a35',
  hotel: '#a93226',
  passGo: '#c0392b',
};
