import { Injectable, type NestMiddleware } from '@nestjs/common';
import { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';

export const CORRELATION_HEADER = 'x-correlation-id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(CORRELATION_HEADER);
    const id = incoming && UUID_RE.test(incoming) ? incoming : randomUUID();
    req.correlationId = id;
    res.setHeader(CORRELATION_HEADER, id);
    if (req.log && typeof req.log.child === 'function') {
      req.log = req.log.child({ correlationId: id });
    }
    next();
  }
}
