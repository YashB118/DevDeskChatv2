import { AppError } from '@app/shared/errors';

export class SessionNotFoundError extends AppError {
  constructor(name: string) {
    super({
      code: 'SESSION_NOT_FOUND',
      statusCode: 404,
      message: `Session not found: ${name}`,
      details: { name },
    });
  }
}
