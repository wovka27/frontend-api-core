import type { GenericAbortSignal } from 'axios';

export interface ComposedSignalResult {
  signal?: AbortSignal;
  cleanup?: () => void;
}

type S = AbortSignal | GenericAbortSignal | undefined | null;

export function composeSignals(...signals: S[]): ComposedSignalResult {
  const activeSignals = signals.filter((s): s is AbortSignal => Boolean(s));
  if (activeSignals.length === 0) return {};
  if (activeSignals.length === 1) return { signal: activeSignals[0] };

  if (typeof AbortSignal.any === 'function') return { signal: AbortSignal.any(activeSignals) };

  const controller = new AbortController();
  const handlers: Array<{ signal: AbortSignal; handler: () => void }> = [];

  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return { signal: controller.signal };
    }
    const handler = () => controller.abort(signal.reason);
    signal.addEventListener('abort', handler, { once: true });
    handlers.push({ signal, handler });
  }

  const cleanup = () => {
    for (const { signal, handler } of handlers) signal.removeEventListener('abort', handler);
  };

  return { signal: controller.signal, cleanup };
}
