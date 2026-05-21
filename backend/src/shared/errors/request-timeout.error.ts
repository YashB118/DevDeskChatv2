import { AppError } from './app.error';

export class RequestTimeoutError extends AppError {
  constructor(timeoutMs: number) {
    super({
      code: 'REQUEST_TIMEOUT',
      statusCode: 503,
      message: 'Request exceeded server time budget',
      details: { timeoutMs },
    });
  }
}
