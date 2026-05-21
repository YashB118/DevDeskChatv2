/**
 * OpenTelemetry bootstrap. Imported at the very top of `main.ts` (before any
 * other application import) so the SDK's auto-instrumentation can patch
 * `express`, `pg`, `ioredis`, `axios`, and `bullmq` before NestJS resolves
 * them. Reading env directly is the only place outside `env.ts` that is
 * allowed — `loadEnv` cannot run before this file because the parsed config
 * itself transits the patched HTTP layer.
 */
import { trace, type Tracer } from '@opentelemetry/api';

let started = false;
let tracer: Tracer | null = null;

function readBool(v: string | undefined): boolean {
  return v === 'true' || v === '1';
}

function readNumber(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export interface TelemetryHandle {
  started: boolean;
  shutdown: () => Promise<void>;
}

const noopShutdown = (): Promise<void> => Promise.resolve();

export async function startTelemetry(): Promise<TelemetryHandle> {
  if (started) return { started: true, shutdown: noopShutdown };
  if (!readBool(process.env.OTEL_ENABLED)) {
    return { started: false, shutdown: noopShutdown };
  }

  // Imports are dynamic so non-telemetry deployments don't pay the cost of
  // loading hundreds of auto-instrumentation modules at startup.
  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
  const { Resource } = await import('@opentelemetry/resources');
  const semconv = (await import('@opentelemetry/semantic-conventions')) as unknown as Record<
    string,
    string
  >;
  // `ATTR_SERVICE_NAME` / `ATTR_SERVICE_VERSION` are the v1.27+ exports;
  // older `SEMRESATTRS_*` constants are kept as fallbacks for environments
  // pinned to the deprecated names. Reading at runtime sidesteps the
  // deprecation-on-import warning while keeping a single source of truth.
  const serviceNameKey =
    semconv.ATTR_SERVICE_NAME ?? semconv.SEMRESATTRS_SERVICE_NAME ?? 'service.name';
  const serviceVersionKey =
    semconv.ATTR_SERVICE_VERSION ?? semconv.SEMRESATTRS_SERVICE_VERSION ?? 'service.version';
  const { TraceIdRatioBasedSampler } = await import('@opentelemetry/sdk-trace-base');

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const serviceName = process.env.OTEL_SERVICE_NAME ?? 'devdeskchat-backend';
  const ratio = readNumber(process.env.OTEL_TRACES_SAMPLER_RATIO, 1);

  // NodeSDK rejects `undefined` exporter under exactOptionalPropertyTypes —
  // only include the key when an endpoint is configured.
  const sdkOptions: Record<string, unknown> = {
    serviceName,
    resource: new Resource({
      [serviceNameKey]: serviceName,
      [serviceVersionKey]: process.env.npm_package_version ?? '0.0.0',
    }),
    sampler: new TraceIdRatioBasedSampler(ratio),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  };
  if (endpoint !== undefined) {
    sdkOptions.traceExporter = new OTLPTraceExporter({ url: endpoint });
  }

  const sdk = new NodeSDK(sdkOptions);

  sdk.start();
  started = true;
  tracer = trace.getTracer(serviceName);
  return {
    started: true,
    shutdown: async (): Promise<void> => {
      await sdk.shutdown();
      started = false;
      tracer = null;
    },
  };
}

/**
 * Resolve the application tracer. Returns the global noop tracer when OTel is
 * disabled — call sites can always `tracer.startActiveSpan` safely.
 */
export function getTracer(): Tracer {
  return tracer ?? trace.getTracer(process.env.OTEL_SERVICE_NAME ?? 'devdeskchat-backend');
}

export function isTelemetryStarted(): boolean {
  return started;
}
