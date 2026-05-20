import { AppError } from './app.error';

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: Record<string, unknown>) {
    super({
      code: 'CONFLICT',
      statusCode: 409,
      message,
      ...(details === undefined ? {} : { details }),
    });
  }
}
