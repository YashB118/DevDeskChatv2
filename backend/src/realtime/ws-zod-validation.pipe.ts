import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { type ZodSchema, type ZodTypeAny, type z } from 'zod';

/**
 * WebSocket variant of ZodValidationPipe. Throws `WsException` so the
 * gateway's exception filter (or default ws handler) surfaces a structured
 * error to the client instead of disconnecting the socket.
 */
@Injectable()
export class WsZodValidationPipe<TSchema extends ZodTypeAny> implements PipeTransform<
  unknown,
  z.infer<TSchema>
> {
  constructor(private readonly schema: ZodSchema<z.infer<TSchema>>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.infer<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new WsException({
        code: 'INVALID_PAYLOAD',
        issues: result.error.issues.map((i) => ({
          path: i.path,
          message: i.message,
          code: i.code,
        })),
      });
    }
    return result.data;
  }
}
