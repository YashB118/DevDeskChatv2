import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard';
import { type AppConfig } from '@app/config/env';
import { IS_PUBLIC_KEY } from '@app/common/decorators/public.decorator';
import { UserRole } from '@app/modules/users/user.types';

function makeCtx(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

const config: AppConfig = {
  JWT_PUBLIC_KEY: 'pub',
  JWT_ISSUER: 'iss',
  JWT_AUDIENCE: 'aud',
} as unknown as AppConfig;

describe('JwtAuthGuard', () => {
  it('allows public routes without a token', async () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === IS_PUBLIC_KEY ? true : undefined,
    );
    const jwt = { verifyAsync: vi.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(config, jwt, reflector);
    const ctx = makeCtx({ header: () => undefined });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects when bearer header is missing', async () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const jwt = { verifyAsync: vi.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(config, jwt, reflector);
    const ctx = makeCtx({ header: () => undefined });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects when JWT verify fails', async () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const jwt = {
      verifyAsync: vi.fn().mockRejectedValue(new Error('bad sig')),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(config, jwt, reflector);
    const ctx = makeCtx({
      header: (n: string) => (n.toLowerCase() === 'authorization' ? 'Bearer abc' : undefined),
    });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('populates req.user on valid token', async () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const jwt = {
      verifyAsync: vi.fn().mockResolvedValue({
        sub: 'u-1',
        email: 'a@b.c',
        role: UserRole.ADMIN,
      }),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(config, jwt, reflector);
    const req: Record<string, unknown> = {
      header: (n: string) => (n.toLowerCase() === 'authorization' ? 'Bearer abc' : undefined),
    };
    const ctx = makeCtx(req);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((req as { user?: { id: string } }).user?.id).toBe('u-1');
  });
});
