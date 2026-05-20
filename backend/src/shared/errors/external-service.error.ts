import { AppError } from './app.error';

export class ExternalServiceError extends AppError {
  constructor(
    message = 'External service unavailable',
    details?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super({
      code: 'EXTERNAL_SERVICE_ERROR',
      statusCode: 502,
      message,
      ...(details === undefined ? {} : { details }),
      ...(cause === undefined ? {} : { cause }),
    });
  }
}
