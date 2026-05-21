import { AppError } from './app.error';

export class RateLimitedError extends AppError {
  constructor(retryAfterSeconds: number, details?: Record<string, unknown>) {
    super({
      code: 'RATE_LIMITED',
      statusCode: 429,
      message: 'Rate limit exceeded',
      details: { retryAfterSeconds, ...(details ?? {}) },
    });
  }
}
