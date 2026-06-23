import type { Color } from './cards.js';

export const SET_SIZES: Record<Color, number> = {
  brown: 2,
  lightBlue: 3,
  pink: 3,
  orange: 3,
  red: 3,
  yellow: 3,
  green: 3,
  darkBlue: 2,
  railroad: 4,
  utility: 2,
};

export const RENT_LADDERS: Record<Color, number[]> = {
  brown: [1, 2],
  lightBlue: [1, 2, 3],
  pink: [1, 2, 4],
  orange: [1, 3, 5],
  red: [2, 3, 6],
  yellow: [2, 4, 6],
  green: [2, 4, 7],
  darkBlue: [3, 8],
  railroad: [1, 2, 3, 4],
  utility: [1, 2],
};

export const HOUSE_BONUS = 3;
export const HOTEL_BONUS = 4;
export const COMPLETE_SETS_TO_WIN = 3;
export const STARTING_HAND_SIZE = 5;
export const NORMAL_DRAW = 2;
export const EMPTY_HAND_DRAW = 5;
export const MAX_HAND_SIZE = 7;
export const PLAYS_PER_TURN = 3;
export const JSN_TIMEOUT_SECONDS = 30;
