import { AppError } from './app.error';

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: Record<string, unknown>) {
    super({
      code: 'NOT_FOUND',
      statusCode: 404,
      message,
      ...(details === undefined ? {} : { details }),
    });
  }
}
