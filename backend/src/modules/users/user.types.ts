import { type UserId } from '@app/shared/types/ids';

export enum UserRole {
  ADMIN = 'ADMIN',
  DEVELOPER = 'DEVELOPER',
}

export interface UserDomain {
  id: UserId;
  email: string;
  role: UserRole;
  displayName: string;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithCredentials extends UserDomain {
  passwordHash: string;
}
