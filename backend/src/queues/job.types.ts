import { type infer as ZodInfer, type ZodTypeAny } from 'zod';

export interface JobEnvelope<T> {
  correlationId?: string;
  payload: T;
}

export type PayloadOf<S extends ZodTypeAny> = ZodInfer<S>;
