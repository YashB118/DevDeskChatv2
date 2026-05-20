import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import { type Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  role: string;
  email: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    return req.user;
  },
);
