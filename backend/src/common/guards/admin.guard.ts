import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import { ROLES_KEY } from '@app/common/decorators/roles.decorator';
import { ForbiddenError, UnauthorizedError } from '@app/modules/auth/auth.errors';
import { type AuthenticatedRequestUser } from '@app/modules/auth/auth.types';
import { UserRole } from '@app/modules/users/user.types';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedRequestUser }>();
    if (!req.user) throw new UnauthorizedError();

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]) ?? [UserRole.ADMIN];

    if (!requiredRoles.includes(req.user.role)) {
      throw new ForbiddenError('Admin role required');
    }
    return true;
  }
}
