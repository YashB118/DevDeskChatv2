import { SetMetadata, applyDecorators } from '@nestjs/common';
import { RATE_LIMIT_META, type RateLimitDescriptor } from './rate-limit.types';

/**
 * Attach a per-route rate-limit descriptor to a controller or handler. Picked
 * up by `RouteRateLimitInterceptor` (registered globally).
 */
export const RateLimit = (descriptor: RateLimitDescriptor): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(RATE_LIMIT_META, descriptor));
