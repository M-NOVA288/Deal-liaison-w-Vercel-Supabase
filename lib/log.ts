/**
 * Structured JSON logger.
 *
 * Every line is one JSON object, so Vercel's log drain (or any log tool: Datadog, Grafana Loki,
 * CloudWatch) can filter by level, event, route or request id instead of grepping free text.
 */
export type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = (): Level => {
  const v = process.env.LOG_LEVEL as Level | undefined;
  return v && v in ORDER ? v : 'info';
};

/** Header the middleware sets on every request; handlers echo it back so one request can be traced end to end. */
export const REQUEST_ID_HEADER = 'x-request-id';

export function requestId(req: Request): string {
  return req.headers.get(REQUEST_ID_HEADER) ?? 'none';
}

function serializeError(err: unknown) {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack?.split('\n').slice(0, 5).join('\n') };
  if (err && typeof err === 'object') return err;
  return { message: String(err) };
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  if (ORDER[level] < ORDER[minLevel()]) return;
  const line: Record<string, unknown> = { ts: new Date().toISOString(), level, event, ...fields };
  if ('err' in line) line.err = serializeError(line.err);
  const out = JSON.stringify(line);
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);
}

/** Times an async operation and logs its duration, so slow dependencies show up in logs. */
export async function timed<T>(event: string, fields: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    log('info', event, { ...fields, ms: Date.now() - start, ok: true });
    return result;
  } catch (err) {
    log('error', event, { ...fields, ms: Date.now() - start, ok: false, err });
    throw err;
  }
}
