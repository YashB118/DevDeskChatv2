import { type UserRole } from '@app/modules/users/user.types';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
}

export interface AuthenticatedRequestUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AccessTokenResult {
  accessToken: string;
  accessTokenExpiresIn: number;
  user: {
    id: string;
    email: string;
    role: UserRole;
    displayName: string;
  };
}

export interface RefreshTokenIssuance {
  token: string;
  id: string;
  familyId: string;
  expiresAt: Date;
}

export interface LoginResult extends AccessTokenResult {
  refresh: RefreshTokenIssuance;
}

export type AuditEvent =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.refresh.success'
  | 'auth.refresh.reuse'
  | 'auth.refresh.invalid'
  | 'auth.logout'
  | 'auth.password.change'
  | 'user.create'
  | 'user.update'
  | 'user.disable'
  | 'user.enable'
  | 'user.password.reset'
  | 'assignment.create'
  | 'assignment.remove'
  | 'mute.chat.set'
  | 'mute.global.set';
