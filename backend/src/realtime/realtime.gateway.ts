import { Inject, Logger, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { JwtService, type JwtVerifyOptions } from '@nestjs/jwt';
import { type Server as IoServer } from 'socket.io';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { activeSocketConnections } from '@app/shared/observability/metrics.registry';
import { UserRole } from '@app/modules/users/user.types';
import { type JwtPayload } from '@app/modules/auth/auth.types';
import {
  ChatsJoinSchema,
  ChatsLeaveSchema,
  PingSchema,
  type ChatsJoinPayload,
  type ChatsLeavePayload,
  type PingPayload,
} from './events.contract';
import { roomFor } from './socket.rooms';
import { SequenceService } from './sequence';
import { type AuthedSocket } from './socket.types';
import { WsAuthGuard } from './ws-jwt.guard';
import { WsZodValidationPipe } from './ws-zod-validation.pipe';

const PING_TIMEOUT_MS = 30_000;
const PING_INTERVAL_MS = 25_000;
const MAX_HTTP_BUFFER_SIZE = 1_000_000; // 1 MB

@WebSocketGateway({
  transports: ['websocket'],
  pingTimeout: PING_TIMEOUT_MS,
  pingInterval: PING_INTERVAL_MS,
  maxHttpBufferSize: MAX_HTTP_BUFFER_SIZE,
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer() server!: IoServer;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly sequence: SequenceService,
  ) {}

  afterInit(server: IoServer): void {
    // CORS is configured at the HTTP layer; mirror it on the io server so
    // the upgrade request from non-allowlisted origins is rejected pre-auth.
    const origins = this.config.CORS_ORIGINS;
    server.engine.opts.cors = {
      origin: origins.includes('*') ? true : origins,
      credentials: true,
    };
    this.logger.log('realtime gateway initialised');
  }

  async handleConnection(client: AuthedSocket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`socket ${client.id} no token; disconnecting`);
      client.disconnect(true);
      return;
    }

    let payload: JwtPayload;
    try {
      const verifyOptions: JwtVerifyOptions = {
        algorithms: ['RS256'],
        issuer: this.config.JWT_ISSUER,
        audience: this.config.JWT_AUDIENCE,
        publicKey: this.config.JWT_PUBLIC_KEY,
      };
      payload = await this.jwt.verifyAsync<JwtPayload>(token, verifyOptions);
    } catch (err) {
      this.logger.warn(`socket ${client.id} jwt verify failed: ${(err as Error).message}`);
      client.disconnect(true);
      return;
    }

    client.data.user = { id: payload.sub, email: payload.email, role: payload.role };
    await client.join(roomFor.user(payload.sub));
    if (payload.role === UserRole.ADMIN) await client.join(roomFor.admin());

    activeSocketConnections.inc();
    this.logger.log(`socket ${client.id} connected user=${payload.sub} role=${payload.role}`);
  }

  handleDisconnect(client: AuthedSocket): void {
    const user = client.data.user;
    if (user) activeSocketConnections.dec();
    this.logger.log(`socket ${client.id} disconnected${user ? ` user=${user.id}` : ''}`);
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('ping')
  async onPing(
    @MessageBody(new WsZodValidationPipe(PingSchema)) payload: PingPayload,
    @ConnectedSocket() client: AuthedSocket,
  ): Promise<void> {
    const user = client.data.user;
    if (!user) throw new WsException({ code: 'UNAUTHORIZED' });
    const seq = await this.sequence.next(`user:${user.id}`);
    client.emit('pong', { nonce: payload.nonce, serverTs: Date.now(), seq });
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('chats:join')
  async onChatsJoin(
    @MessageBody(new WsZodValidationPipe(ChatsJoinSchema)) payload: ChatsJoinPayload,
    @ConnectedSocket() client: AuthedSocket,
  ): Promise<{ joined: string[] }> {
    // Assignment-based authorization lives in Phase 9. For now, joining is
    // permitted but kept behind explicit opt-in so the client controls room
    // membership and we don't broadcast to anonymous listeners.
    for (const id of payload.chatIds) {
      await client.join(roomFor.chat(id));
    }
    return { joined: payload.chatIds };
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('chats:leave')
  async onChatsLeave(
    @MessageBody(new WsZodValidationPipe(ChatsLeaveSchema)) payload: ChatsLeavePayload,
    @ConnectedSocket() client: AuthedSocket,
  ): Promise<{ left: string[] }> {
    for (const id of payload.chatIds) {
      await client.leave(roomFor.chat(id));
    }
    return { left: payload.chatIds };
  }

  private extractToken(client: AuthedSocket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (auth && typeof auth.token === 'string' && auth.token.length > 0) return auth.token;
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string') {
      const [scheme, token] = header.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token) return token.trim();
    }
    return null;
  }
}
