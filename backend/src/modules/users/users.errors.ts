import { AppError } from '@app/shared/errors';

export class UserAlreadyExistsError extends AppError {
  constructor(email: string) {
    super({
      code: 'USER_ALREADY_EXISTS',
      statusCode: 409,
      message: `User already exists: ${email}`,
      details: { email },
    });
  }
}

export class UserNotFoundError extends AppError {
  constructor(id: string) {
    super({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
      message: `User not found: ${id}`,
      details: { id },
    });
  }
}
