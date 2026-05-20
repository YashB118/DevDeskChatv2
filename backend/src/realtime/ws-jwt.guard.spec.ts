import { type ExecutionContext } from '@nestjs/common';
import { type JwtService } from '@nestjs/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AppConfig } from '@app/config/env';
import { UserRole } from '@app/modules/users/user.types';
import { WsAuthGuard } from './ws-jwt.guard';
import { type AuthedSocket } from './socket.types';

function makeSocket(opts: { token?: string | undefined; header?: string }): AuthedSocket {
  const disconnect = vi.fn();
  const socket = {
    id: 'sock-1',
    data: {} as { user?: unknown },
    handshake: {
      auth: opts.token === undefined ? {} : { token: opts.token },
      headers: opts.header ? { authorization: opts.header } : {},
    },
    disconnect,
  };
  return socket as unknown as AuthedSocket;
}

function ctxFor(socket: AuthedSocket): ExecutionContext {
  return {
    switchToWs: () => ({ getClient: () => socket, getData: () => ({}) }),
  } as unknown as ExecutionContext;
}

const config: AppConfig = {
  JWT_PUBLIC_KEY: 'pub-pem',
  JWT_ISSUER: 'test-iss',
  JWT_AUDIENCE: 'test-aud',
} as unknown as AppConfig;

describe('WsAuthGuard', () => {
  let jwt: JwtService;
  let guard: WsAuthGuard;

  beforeEach(() => {
    jwt = { verifyAsync: vi.fn() } as unknown as JwtService;
    guard = new WsAuthGuard(config, jwt);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a valid handshake token', async () => {
    (jwt.verifyAsync as ReturnType<typeof vi.fn>).mockResolvedValue({
      sub: 'u1',
      email: 'u@x',
      role: UserRole.DEVELOPER,
    });
    const socket = makeSocket({ token: 'good.token.value' });
    const ok = await guard.canActivate(ctxFor(socket));
    expect(ok).toBe(true);
    expect(socket.data.user).toEqual({ id: 'u1', email: 'u@x', role: UserRole.DEVELOPER });
  });

  it('accepts a bearer header when handshake.auth missing', async () => {
    (jwt.verifyAsync as ReturnType<typeof vi.fn>).mockResolvedValue({
      sub: 'u2',
      email: 'u2@x',
      role: UserRole.ADMIN,
    });
    const socket = makeSocket({ token: undefined, header: 'Bearer some.token' });
    await expect(guard.canActivate(ctxFor(socket))).resolves.toBe(true);
    expect(socket.data.user?.role).toBe(UserRole.ADMIN);
  });

  it('rejects when no token is present and disconnects the socket', async () => {
    const socket = makeSocket({ token: undefined });
    const ok = await guard.canActivate(ctxFor(socket));
    expect(ok).toBe(false);
    expect(socket.disconnect as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(true);
  });

  it('rejects an invalid token and disconnects the socket', async () => {
    (jwt.verifyAsync as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bad sig'));
    const socket = makeSocket({ token: 'garbage.jwt.value' });
    const ok = await guard.canActivate(ctxFor(socket));
    expect(ok).toBe(false);
    expect(socket.disconnect as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(true);
  });

  it('short-circuits when client.data.user is already populated', async () => {
    const socket = makeSocket({ token: undefined });
    socket.data.user = { id: 'cached', email: 'c@x', role: UserRole.DEVELOPER };
    const ok = await guard.canActivate(ctxFor(socket));
    expect(ok).toBe(true);
    expect(socket.disconnect as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });
});
