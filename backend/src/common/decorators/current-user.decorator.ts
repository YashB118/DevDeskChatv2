import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import { type Request } from 'express';
import { type AuthenticatedRequestUser } from '@app/modules/auth/auth.types';

export type AuthenticatedUser = AuthenticatedRequestUser;

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    return req.user;
  },
);
