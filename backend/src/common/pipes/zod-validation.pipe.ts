import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import { type ZodSchema, type ZodTypeAny, type z } from 'zod';
import { ValidationError } from '@app/shared/errors';

@Injectable()
export class ZodValidationPipe<TSchema extends ZodTypeAny> implements PipeTransform<
  unknown,
  z.infer<TSchema>
> {
  constructor(private readonly schema: ZodSchema<z.infer<TSchema>>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.infer<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError('Validation failed', {
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
