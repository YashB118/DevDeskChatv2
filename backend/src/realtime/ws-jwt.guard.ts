import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService, type JwtVerifyOptions } from '@nestjs/jwt';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { type JwtPayload } from '@app/modules/auth/auth.types';
import { type AuthedSocket } from './socket.types';

@Injectable()
export class WsAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsAuthGuard.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const client = ctx.switchToWs().getClient<AuthedSocket>();

    // Already authenticated by connection handler.
    if (client.data.user) return true;

    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`socket ${client.id} missing token`);
      client.disconnect(true);
      return false;
    }

    const verifyOptions: JwtVerifyOptions = {
      algorithms: ['RS256'],
      issuer: this.config.JWT_ISSUER,
      audience: this.config.JWT_AUDIENCE,
      publicKey: this.config.JWT_PUBLIC_KEY,
    };

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, verifyOptions);
      client.data.user = { id: payload.sub, email: payload.email, role: payload.role };
      return true;
    } catch (err) {
      this.logger.warn(`socket ${client.id} jwt verify failed: ${(err as Error).message}`);
      client.disconnect(true);
      return false;
    }
  }

  private extractToken(client: AuthedSocket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (auth && typeof auth.token === 'string' && auth.token.length > 0) {
      return auth.token;
    }
    // Fallback: Authorization header (some clients can only set headers).
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string') {
      const [scheme, token] = header.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token) return token.trim();
    }
    return null;
  }
}
