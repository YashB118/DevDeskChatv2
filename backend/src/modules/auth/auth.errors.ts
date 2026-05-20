import { AppError } from '@app/shared/errors';

export class InvalidCredentialsError extends AppError {
  constructor() {
    super({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
      message: 'Invalid credentials',
    });
  }
}

export class InvalidRefreshTokenError extends AppError {
  constructor() {
    super({
      code: 'INVALID_REFRESH_TOKEN',
      statusCode: 401,
      message: 'Invalid refresh token',
    });
  }
}

export class UserDisabledError extends AppError {
  constructor() {
    super({
      code: 'USER_DISABLED',
      statusCode: 403,
      message: 'User account is disabled',
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super({
      code: 'UNAUTHORIZED',
      statusCode: 401,
      message,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super({
      code: 'FORBIDDEN',
      statusCode: 403,
      message,
    });
  }
}
