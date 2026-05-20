import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AdminGuard } from './admin.guard';
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

describe('AdminGuard', () => {
  it('throws Unauthorized when req.user is missing', () => {
    const reflector = new Reflector();
    const guard = new AdminGuard(reflector);
    expect(() => guard.canActivate(makeCtx({}))).toThrow(/Unauthorized/);
  });

  it('allows admins by default', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const guard = new AdminGuard(reflector);
    const ok = guard.canActivate(
      makeCtx({ user: { id: 'u', email: 'a@b.c', role: UserRole.ADMIN } }),
    );
    expect(ok).toBe(true);
  });

  it('rejects developers when admin is required', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const guard = new AdminGuard(reflector);
    expect(() =>
      guard.canActivate(makeCtx({ user: { id: 'u', email: 'a@b.c', role: UserRole.DEVELOPER } })),
    ).toThrow(/Admin role required/);
  });

  it('honors @Roles override', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.DEVELOPER]);
    const guard = new AdminGuard(reflector);
    const ok = guard.canActivate(
      makeCtx({ user: { id: 'u', email: 'a@b.c', role: UserRole.DEVELOPER } }),
    );
    expect(ok).toBe(true);
  });
});
