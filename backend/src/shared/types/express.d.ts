import 'express';
import type { Logger } from 'pino';

declare module 'express-serve-static-core' {
  interface Request {
    correlationId?: string;
    log?: Logger;
    rawBody?: Buffer;
  }
}

export {};
