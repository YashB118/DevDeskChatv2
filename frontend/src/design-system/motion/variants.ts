import type { Variants } from 'framer-motion';
import { easingTuple } from '../tokens/motion';

const baseDur = 0.22;
const fastDur = 0.16;

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: baseDur, ease: easingTuple.standard } },
  exit: { opacity: 0, transition: { duration: fastDur, ease: easingTuple.exit } },
};

export const slideUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: baseDur, ease: easingTuple.standard } },
  exit: { opacity: 0, y: 8, transition: { duration: fastDur, ease: easingTuple.exit } },
};

export const slideDown: Variants = {
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0, transition: { duration: baseDur, ease: easingTuple.standard } },
  exit: { opacity: 0, y: -8, transition: { duration: fastDur, ease: easingTuple.exit } },
};

export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: baseDur, ease: easingTuple.emphasized } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: fastDur, ease: easingTuple.exit } },
};

export const staggerList: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

export const instant: Variants = {
  initial: { opacity: 1 },
  animate: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 1, transition: { duration: 0 } },
};

export function reducedMotionVariants(v: Variants, reducedMotion: boolean): Variants {
  return reducedMotion ? instant : v;
}
