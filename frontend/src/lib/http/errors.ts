import type { AxiosError } from 'axios';
import { z } from 'zod';

const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    correlationId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export class AppApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly correlationId: string | undefined;
  readonly details: unknown;

  constructor(opts: {
    code: string;
    message: string;
    status: number;
    correlationId?: string | undefined;
    details?: unknown;
  }) {
    super(opts.message);
    this.name = 'AppApiError';
    this.code = opts.code;
    this.status = opts.status;
    this.correlationId = opts.correlationId;
    this.details = opts.details;
  }

  static fromAxios(err: AxiosError): AppApiError {
    const status = err.response?.status ?? 0;
    const correlationId =
      (err.response?.headers as Record<string, string> | undefined)?.['x-correlation-id'];

    const parsed = ErrorEnvelopeSchema.safeParse(err.response?.data);
    if (parsed.success) {
      return new AppApiError({
        code: parsed.data.error.code,
        message: parsed.data.error.message,
        status,
        correlationId: parsed.data.error.correlationId ?? correlationId,
        details: parsed.data.error.details,
      });
    }

    return new AppApiError({
      code: status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR',
      message: err.message || 'Unexpected error',
      status,
      correlationId,
    });
  }

  static isAppApiError(err: unknown): err is AppApiError {
    return err instanceof AppApiError;
  }
}
