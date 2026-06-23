export type Color =
  | 'brown'
  | 'lightBlue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'darkBlue'
  | 'railroad'
  | 'utility';

export type CardType = 'money' | 'property' | 'wildcard' | 'rent' | 'action';

export interface BaseCard {
  id: string;       // unique e.g. 'money_1m_1'
  type: CardType;
  bankValue: number; // in $M
}

export interface MoneyCard extends BaseCard {
  type: 'money';
  value: number;
}

export interface PropertyCard extends BaseCard {
  type: 'property';
  color: Color;
  name: string;
}

export interface WildcardCard extends BaseCard {
  type: 'wildcard';
  colors: Color[];   // 2 colors for 2-color wildcards, 10 for multi-color
  isMultiColor: boolean; // true for the 2 multi-color wildcards ($0 bank)
}

export interface RentCard extends BaseCard {
  type: 'rent';
  colors: Color[];   // 2 colors, or empty for wild rent
  isWild: boolean;   // true for the 3 "any color" rent cards
}

export interface ActionCard extends BaseCard {
  type: 'action';
  action:
    | 'dealBreaker'
    | 'justSayNo'
    | 'slyDeal'
    | 'forcedDeal'
    | 'debtCollector'
    | 'birthday'
    | 'doubleTheRent'
    | 'house'
    | 'hotel'
    | 'passGo';
}

export type Card = MoneyCard | PropertyCard | WildcardCard | RentCard | ActionCard;

// ---------------------------------------------------------------------------
// Property definitions
// ---------------------------------------------------------------------------

interface PropertyDef {
  color: Color;
  name: string;
  bankValue: number;
}

const PROPERTY_DEFS: PropertyDef[] = [
  // Brown (2)
  { color: 'brown', name: 'Mediterranean Avenue', bankValue: 1 },
  { color: 'brown', name: 'Baltic Avenue', bankValue: 1 },
  // Light Blue (3)
  { color: 'lightBlue', name: 'Oriental Avenue', bankValue: 1 },
  { color: 'lightBlue', name: 'Vermont Avenue', bankValue: 1 },
  { color: 'lightBlue', name: 'Connecticut Avenue', bankValue: 1 },
  // Pink (3)
  { color: 'pink', name: 'St. Charles Place', bankValue: 2 },
  { color: 'pink', name: 'States Avenue', bankValue: 2 },
  { color: 'pink', name: 'Virginia Avenue', bankValue: 2 },
  // Orange (3)
  { color: 'orange', name: 'St. James Place', bankValue: 2 },
  { color: 'orange', name: 'Tennessee Avenue', bankValue: 2 },
  { color: 'orange', name: 'New York Avenue', bankValue: 2 },
  // Red (3)
  { color: 'red', name: 'Kentucky Avenue', bankValue: 3 },
  { color: 'red', name: 'Indiana Avenue', bankValue: 3 },
  { color: 'red', name: 'Illinois Avenue', bankValue: 3 },
  // Yellow (3)
  { color: 'yellow', name: 'Atlantic Avenue', bankValue: 3 },
  { color: 'yellow', name: 'Ventnor Avenue', bankValue: 3 },
  { color: 'yellow', name: 'Marvin Gardens', bankValue: 3 },
  // Green (3)
  { color: 'green', name: 'Pacific Avenue', bankValue: 4 },
  { color: 'green', name: 'North Carolina Avenue', bankValue: 4 },
  { color: 'green', name: 'Pennsylvania Avenue', bankValue: 4 },
  // Dark Blue (2)
  { color: 'darkBlue', name: 'Park Place', bankValue: 4 },
  { color: 'darkBlue', name: 'Boardwalk', bankValue: 4 },
  // Railroad (4)
  { color: 'railroad', name: 'Reading Railroad', bankValue: 2 },
  { color: 'railroad', name: 'Pennsylvania Railroad', bankValue: 2 },
  { color: 'railroad', name: 'B&O Railroad', bankValue: 2 },
  { color: 'railroad', name: 'Short Line Railroad', bankValue: 2 },
  // Utility (2)
  { color: 'utility', name: 'Electric Company', bankValue: 2 },
  { color: 'utility', name: 'Water Works', bankValue: 2 },
];

// ---------------------------------------------------------------------------
// Wildcard definitions
// ---------------------------------------------------------------------------

interface WildcardDef {
  colors: Color[];
  bankValue: number;
  isMultiColor: boolean;
  count: number;
}

const ALL_COLORS: Color[] = [
  'brown', 'lightBlue', 'pink', 'orange', 'red',
  'yellow', 'green', 'darkBlue', 'railroad', 'utility',
];

const WILDCARD_DEFS: WildcardDef[] = [
  { colors: ['lightBlue', 'brown'],    bankValue: 1, isMultiColor: false, count: 1 },
  { colors: ['lightBlue', 'railroad'], bankValue: 2, isMultiColor: false, count: 1 },
  { colors: ['pink', 'orange'],        bankValue: 2, isMultiColor: false, count: 2 },
  { colors: ['red', 'yellow'],         bankValue: 3, isMultiColor: false, count: 2 },
  { colors: ['darkBlue', 'green'],     bankValue: 4, isMultiColor: false, count: 1 },
  { colors: ['green', 'railroad'],     bankValue: 4, isMultiColor: false, count: 1 },
  { colors: ['railroad', 'utility'],   bankValue: 2, isMultiColor: false, count: 1 },
  { colors: ALL_COLORS,               bankValue: 0, isMultiColor: true,  count: 2 },
];

// ---------------------------------------------------------------------------
// Rent definitions
// ---------------------------------------------------------------------------

interface RentDef {
  colors: Color[];
  isWild: boolean;
  bankValue: number;
  count: number;
}

const RENT_DEFS: RentDef[] = [
  { colors: ['darkBlue', 'green'],    isWild: false, bankValue: 1, count: 2 },
  { colors: ['red', 'yellow'],        isWild: false, bankValue: 1, count: 2 },
  { colors: ['pink', 'orange'],       isWild: false, bankValue: 1, count: 2 },
  { colors: ['lightBlue', 'brown'],   isWild: false, bankValue: 1, count: 2 },
  { colors: ['railroad', 'utility'],  isWild: false, bankValue: 1, count: 2 },
  { colors: [],                       isWild: true,  bankValue: 3, count: 3 },
];

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

interface ActionDef {
  action: ActionCard['action'];
  bankValue: number;
  count: number;
}

const ACTION_DEFS: ActionDef[] = [
  { action: 'dealBreaker',    bankValue: 5, count: 2  },
  { action: 'justSayNo',     bankValue: 4, count: 3  },
  { action: 'slyDeal',       bankValue: 3, count: 3  },
  { action: 'forcedDeal',    bankValue: 3, count: 3  },
  { action: 'debtCollector', bankValue: 3, count: 3  },
  { action: 'birthday',      bankValue: 2, count: 3  },
  { action: 'doubleTheRent', bankValue: 1, count: 2  },
  { action: 'house',         bankValue: 3, count: 3  },
  { action: 'hotel',         bankValue: 4, count: 2  },
  { action: 'passGo',        bankValue: 1, count: 10 },
];

// ---------------------------------------------------------------------------
// Money definitions
// ---------------------------------------------------------------------------

interface MoneyDef {
  value: number;
  count: number;
}

const MONEY_DEFS: MoneyDef[] = [
  { value: 10, count: 1 },
  { value: 5,  count: 2 },
  { value: 4,  count: 3 },
  { value: 3,  count: 3 },
  { value: 2,  count: 5 },
  { value: 1,  count: 6 },
];

// ---------------------------------------------------------------------------
// buildDeck
// ---------------------------------------------------------------------------

export function buildDeck(): Card[] {
  const deck: Card[] = [];

  // Money cards (20)
  for (const def of MONEY_DEFS) {
    for (let i = 1; i <= def.count; i++) {
      deck.push({
        id: `money_${def.value}m_${i}`,
        type: 'money',
        bankValue: def.value,
        value: def.value,
      } satisfies MoneyCard);
    }
  }

  // Property cards (28)
  const colorCounters: Partial<Record<Color, number>> = {};
  for (const def of PROPERTY_DEFS) {
    colorCounters[def.color] = (colorCounters[def.color] ?? 0) + 1;
    const idx = colorCounters[def.color] as number;
    deck.push({
      id: `property_${def.color}_${idx}`,
      type: 'property',
      bankValue: def.bankValue,
      color: def.color,
      name: def.name,
    } satisfies PropertyCard);
  }

  // Wildcard cards (11)
  for (const def of WILDCARD_DEFS) {
    const label = def.isMultiColor
      ? 'multicolor'
      : def.colors.join('_');
    for (let i = 1; i <= def.count; i++) {
      deck.push({
        id: `wildcard_${label}_${i}`,
        type: 'wildcard',
        bankValue: def.bankValue,
        colors: def.colors,
        isMultiColor: def.isMultiColor,
      } satisfies WildcardCard);
    }
  }

  // Rent cards (13)
  for (const def of RENT_DEFS) {
    const label = def.isWild ? 'wild' : def.colors.join('_');
    for (let i = 1; i <= def.count; i++) {
      deck.push({
        id: `rent_${label}_${i}`,
        type: 'rent',
        bankValue: def.bankValue,
        colors: def.colors,
        isWild: def.isWild,
      } satisfies RentCard);
    }
  }

  // Action cards (34)
  for (const def of ACTION_DEFS) {
    for (let i = 1; i <= def.count; i++) {
      deck.push({
        id: `action_${def.action}_${i}`,
        type: 'action',
        bankValue: def.bankValue,
        action: def.action,
      } satisfies ActionCard);
    }
  }

  return deck;
}
