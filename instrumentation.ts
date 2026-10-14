import { registerOTel } from '@vercel/otel';

/**
 * OpenTelemetry tracing. Next.js calls register() once per server start.
 *
 * @vercel/otel auto-instruments incoming requests and outgoing fetch() calls (Stripe, Supabase,
 * Resend), so each request becomes a trace with a span per dependency call and its latency.
 * Where traces go is set with standard env vars, e.g.
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318   (local collector / Jaeger / Grafana Tempo)
 * On Vercel, traces can also be forwarded with a Vercel OTel integration.
 */
export function register() {
  registerOTel({ serviceName: process.env.OTEL_SERVICE_NAME || 'deal-engine' });
}
