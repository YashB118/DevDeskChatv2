import { AppError } from './app.error';

export interface ExternalServiceErrorOptions {
  code?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
  statusCode?: number;
}

export class ExternalServiceError extends AppError {
  constructor(message?: string, opts?: ExternalServiceErrorOptions) {
    super({
      code: opts?.code ?? 'EXTERNAL_SERVICE_ERROR',
      statusCode: opts?.statusCode ?? 502,
      message: message ?? 'External service unavailable',
      ...(opts?.details === undefined ? {} : { details: opts.details }),
      ...(opts?.cause === undefined ? {} : { cause: opts.cause }),
    });
  }
}
