import { Body } from '@nestjs/common';
import { type ZodSchema } from 'zod';
import { ZodValidationPipe } from '@app/common/pipes/zod-validation.pipe';

export const ZodBody = (schema: ZodSchema<unknown>): ParameterDecorator =>
  Body(new ZodValidationPipe(schema));
