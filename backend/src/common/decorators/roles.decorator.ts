import { SetMetadata } from '@nestjs/common';
import { type UserRole } from '@app/modules/users/user.types';

export const ROLES_KEY = 'auth:required-roles';

export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
