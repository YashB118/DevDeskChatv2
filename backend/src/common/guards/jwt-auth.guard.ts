import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService, type JwtVerifyOptions } from '@nestjs/jwt';
import { Inject } from '@nestjs/common';
import { type Request } from 'express';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { IS_PUBLIC_KEY } from '@app/common/decorators/public.decorator';
import { type AuthenticatedRequestUser, type JwtPayload } from '@app/modules/auth/auth.types';
import { UnauthorizedError } from '@app/modules/auth/auth.errors';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedRequestUser }>();
    const token = this.extractBearer(req);
    if (!token) throw new UnauthorizedError('Missing access token');

    const verifyOptions: JwtVerifyOptions = {
      algorithms: ['RS256'],
      issuer: this.config.JWT_ISSUER,
      audience: this.config.JWT_AUDIENCE,
      publicKey: this.config.JWT_PUBLIC_KEY,
    };

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, verifyOptions);
    } catch {
      throw new UnauthorizedError('Invalid access token');
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    return true;
  }

  private extractBearer(req: Request): string | null {
    const header = req.header('authorization') ?? req.header('Authorization');
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token.trim();
  }
}
