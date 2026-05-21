import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { roomKindFor, socketEventsEmittedTotal } from '@app/shared/observability/metrics.registry';
import { OutboundEvents, type OutboundEventName, type OutboundPayload } from './events.contract';
import { RealtimeGateway } from './realtime.gateway';
import { roomFor } from './socket.rooms';

/**
 * Typed broadcaster other modules inject to push events without depending
 * on the gateway's transport API. Payloads are Zod-validated outside
 * production so contract drift surfaces in CI rather than at clients.
 *
 * The Socket.IO `Server` is read lazily from the gateway because
 * `@WebSocketServer()` is only populated after the WS adapter initializes,
 * which happens after Nest finishes wiring providers.
 */
@Injectable()
export class SocketEmitter {
  private readonly logger = new Logger(SocketEmitter.name);
  private readonly validate: boolean;

  constructor(
    @Inject(forwardRef(() => RealtimeGateway)) private readonly gateway: RealtimeGateway,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.validate = config.NODE_ENV !== 'production';
  }

  toUser<E extends OutboundEventName>(userId: string, event: E, payload: OutboundPayload<E>): void {
    this.emit(roomFor.user(userId), event, payload);
  }

  toChat<E extends OutboundEventName>(chatId: string, event: E, payload: OutboundPayload<E>): void {
    this.emit(roomFor.chat(chatId), event, payload);
  }

  toAdmins<E extends OutboundEventName>(event: E, payload: OutboundPayload<E>): void {
    this.emit(roomFor.admin(), event, payload);
  }

  toSocket<E extends OutboundEventName>(
    socketId: string,
    event: E,
    payload: OutboundPayload<E>,
  ): void {
    if (!this.checkPayload(event, payload)) return;
    this.server().to(socketId).emit(event, payload);
    socketEventsEmittedTotal.inc({ event, room_kind: roomKindFor(socketId) });
  }

  /**
   * Force-disconnect every active socket in the user's room. Used after an
   * admin disables a developer account so the user cannot keep using a
   * pre-existing socket session — the JWT remains valid until expiry but the
   * transport is severed.
   */
  disconnectUser(userId: string): void {
    try {
      this.server().in(roomFor.user(userId)).disconnectSockets(true);
    } catch (err) {
      this.logger.warn(`disconnectUser(${userId}) failed: ${(err as Error).message}`);
    }
  }

  private server() {
    // `gateway.server` is populated by Nest after the WS adapter init runs;
    // the type system says it's always set but it isn't at construction
    // time, so we check defensively.
    const server = this.gateway.server as RealtimeGateway['server'] | undefined;
    if (!server) {
      throw new Error('Socket.IO server not initialised yet');
    }
    return server;
  }

  private emit<E extends OutboundEventName>(
    room: string,
    event: E,
    payload: OutboundPayload<E>,
  ): void {
    if (!this.checkPayload(event, payload)) return;
    this.server().to(room).emit(event, payload);
    socketEventsEmittedTotal.inc({ event, room_kind: roomKindFor(room) });
  }

  private checkPayload<E extends OutboundEventName>(
    event: E,
    payload: OutboundPayload<E>,
  ): boolean {
    if (!this.validate) return true;
    const schema = OutboundEvents[event];
    const result = schema.safeParse(payload);
    if (!result.success) {
      this.logger.error(
        `outbound payload invalid for ${event}: ${JSON.stringify(result.error.issues)}`,
      );
      return false;
    }
    return true;
  }
}
