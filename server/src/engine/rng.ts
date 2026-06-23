/**
 * Seeded RNG utilities for the Monopoly Deal engine.
 * Uses mulberry32 — fast, no external dependencies, good enough for a card game.
 */

export type RngFn = () => number;

/**
 * Create a deterministic RNG from a 32-bit integer seed.
 * Returns a function that produces floats in [0, 1).
 */
export function createRng(seed: number): RngFn {
  let s = seed >>> 0;
  return (): number => {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle. Returns a new array; does not mutate the input.
 */
export function shuffleArray<T>(arr: T[], rng: RngFn): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Advance the seed by calling the RNG once and return the new seed value.
 * Because mulberry32 keeps internal state via closure, we need to track the
 * seed separately after each call sequence.  Instead we use a stateless
 * approach: store the seed as "how many times has the RNG been called" —
 * i.e. we just store the raw seed and recreate the RNG when needed, calling
 * it N times to fast-forward.
 *
 * For simplicity, the engine stores the running seed as the output of the last
 * call converted back. The easiest practical approach: store a numeric seed
 * that we can pass back in to createRng to get the same sequence.
 *
 * We use a separate exported helper to run the RNG N steps and return the
 * resulting state as a new seed (we approximate by using the internal state
 * at construction + number of draws).
 */

/**
 * Run `rng` once and return [value, nextSeed] where nextSeed can be used to
 * reconstruct the state.  Since mulberry32 state is just the uint32 `s` and
 * we can't read it back after closure creation, we track the seed externally
 * by always storing how many calls we've made from the original seed.
 *
 * For game state serialisation we store (initialSeed, callCount).  This
 * module exposes a simpler interface: the engine stores a single "rngSeed"
 * number and we advance it by hashing.
 *
 * Simplest deterministic approach: treat each call to nextRng as a pure
 * function that takes a seed and returns {value, newSeed}.
 */
export function nextRng(seed: number): { value: number; newSeed: number } {
  let s = seed >>> 0;
  s |= 0;
  s = (s + 0x6D2B79F5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  // newSeed is the updated internal state `s`, which we can pass back in
  const newSeed = s >>> 0;
  return { value, newSeed };
}

/**
 * Pure Fisher-Yates shuffle using nextRng.
 * Returns [shuffledArray, newSeed].
 */
export function shuffleWithSeed<T>(arr: T[], seed: number): { result: T[]; newSeed: number } {
  const a = [...arr];
  let currentSeed = seed;
  for (let i = a.length - 1; i > 0; i--) {
    const { value, newSeed } = nextRng(currentSeed);
    currentSeed = newSeed;
    const j = Math.floor(value * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return { result: a, newSeed: currentSeed };
}
