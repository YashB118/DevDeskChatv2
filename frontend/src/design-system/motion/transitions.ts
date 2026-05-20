import { durationMs, easingTuple } from '../tokens/motion';

export const transitions = {
  fast: { duration: durationMs.fast / 1000, ease: easingTuple.standard },
  base: { duration: durationMs.base / 1000, ease: easingTuple.standard },
  slow: { duration: durationMs.slow / 1000, ease: easingTuple.standard },
  emphasized: { duration: durationMs.base / 1000, ease: easingTuple.emphasized },
  entry: { duration: durationMs.base / 1000, ease: easingTuple.entry },
  exit: { duration: durationMs.fast / 1000, ease: easingTuple.exit },
  spring: { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.8 },
} as const;
