import { useEffect, useRef } from 'react';
import { OutboundEvents, type OutboundEventName, type OutboundPayload } from './events.contract';
import { eventBus } from './eventBus';
import { useSocket } from './useSocket';

type Handler<E extends OutboundEventName> = (payload: OutboundPayload<E>) => void;

/**
 * Subscribe to a typed outbound socket event.
 *
 * Payload is validated against the Zod contract. In dev, validation failures
 * throw; in prod they are logged via the event bus and dropped — see
 * FRONTEND_IMPLEMENTATION_PLAN.md Phase 5.
 */
export function useSocketEvent<E extends OutboundEventName>(event: E, handler: Handler<E>): void {
  const socket = useSocket();
  // Stash the handler in a ref so callers can pass inline closures without
  // causing the listener to be detached and reattached every render.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;

    const wrapped = ((raw: unknown): void => {
      const schema = OutboundEvents[event];
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        const message = `invalid socket payload for ${event}`;
        if (import.meta.env.DEV) {
          throw new Error(`${message}: ${parsed.error.message}`);
        }
        eventBus.emit('app:error', { message, cause: parsed.error });
        return;
      }
      handlerRef.current(parsed.data);
    }) as (...args: unknown[]) => void;

    type AnyListener = (...args: unknown[]) => void;
    (socket.on as (e: string, l: AnyListener) => void)(event, wrapped);
    return () => {
      (socket.off as (e: string, l: AnyListener) => void)(event, wrapped);
    };
  }, [socket, event]);
}
