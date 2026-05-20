import { AppError } from './app.error';

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: Record<string, unknown>) {
    super({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message,
      ...(details === undefined ? {} : { details }),
    });
  }
}
