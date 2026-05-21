import { SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from '@app/config/telemetry';

/**
 * Wraps a service method in an OTel span. Span name format:
 * `<ModuleHint?>.<ClassName>.<methodName>`. The decorator is intentionally
 * lightweight — auto-instrumentation already captures HTTP, DB, and queue
 * boundaries, so this is just for service-level methods worth seeing as
 * their own span.
 */
export function TraceMethod(options: { name?: string; moduleHint?: string } = {}): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as ((...args: unknown[]) => unknown) | undefined;
    if (typeof original !== 'function') return descriptor;
    const className = (target as { constructor: { name: string } }).constructor.name;
    const methodName = String(propertyKey);
    const spanName =
      options.name ??
      (options.moduleHint !== undefined
        ? `${options.moduleHint}.${className}.${methodName}`
        : `${className}.${methodName}`);

    descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
      const tracer = getTracer();
      return tracer.startActiveSpan(spanName, (span) => {
        let result: unknown;
        try {
          result = original.apply(this, args);
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.end();
          throw err;
        }
        if (result instanceof Promise) {
          return (result as Promise<unknown>).then(
            (v) => {
              span.end();
              return v;
            },
            (err: unknown) => {
              span.recordException(err as Error);
              span.setStatus({ code: SpanStatusCode.ERROR });
              span.end();
              throw err;
            },
          );
        }
        span.end();
        return result;
      });
    };
    return descriptor;
  };
}
