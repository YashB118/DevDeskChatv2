/**
 * Backend realtime contract — re-exported from `@devdesk/contracts`.
 *
 * Single source of truth lives in `packages/contracts/src/events.ts`.
 * Backend and frontend both consume it. Any new event or schema change
 * happens in the contracts package, not here.
 */

export * from '@devdesk/contracts';
