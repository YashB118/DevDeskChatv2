import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@app/shared/errors';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    correlationId: string;
    details?: Record<string, unknown>;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const correlationId = req.correlationId ?? 'unknown';

    const { statusCode, body, logCause } = this.normalize(exception, correlationId);

    if (statusCode >= 500) {
      if (req.log) {
        req.log.error({ err: logCause, code: body.error.code }, body.error.message);
      } else {
        this.logger.error(
          body.error.message,
          logCause instanceof Error ? logCause.stack : undefined,
        );
      }
    } else if (req.log) {
      req.log.warn({ code: body.error.code, statusCode }, body.error.message);
    }

    res.status(statusCode).json(body);
  }

  private normalize(
    exception: unknown,
    correlationId: string,
  ): { statusCode: number; body: ErrorEnvelope; logCause: unknown } {
    if (exception instanceof AppError) {
      return {
        statusCode: exception.statusCode,
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            correlationId,
            ...(exception.details === undefined ? {} : { details: exception.details }),
          },
        },
        logCause: exception,
      };
    }

    if (exception instanceof ZodError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            correlationId,
            details: {
              issues: exception.issues.map((i) => ({
                path: i.path,
                message: i.message,
                code: i.code,
              })),
            },
          },
        },
        logCause: exception,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string }).message ?? exception.message);
      return {
        statusCode: status,
        body: {
          error: {
            code: this.codeFromStatus(status),
            message,
            correlationId,
          },
        },
        logCause: exception,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          correlationId,
        },
      },
      logCause: exception,
    };
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 422:
        return 'UNPROCESSABLE_ENTITY';
      case 429:
        return 'RATE_LIMITED';
      default:
        return status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR';
    }
  }
}
