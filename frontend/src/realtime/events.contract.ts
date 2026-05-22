/**
 * Frontend realtime contract — re-exported from `@devdesk/contracts`.
 *
 * Single source of truth lives in `packages/contracts/src/events.ts`. Backend
 * and frontend both consume it; drift is impossible at compile time.
 *
 * Per-event handler files convert ISO datetime strings into numeric
 * timestamps at the cache boundary so consumers can keep operating on
 * milliseconds-since-epoch internally.
 */

export * from '@devdesk/contracts';
