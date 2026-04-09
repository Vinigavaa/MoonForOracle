/**
 * Lightweight performance instrumentation for development.
 * Logs timing and sizing metrics to the console in dev mode only.
 */

// In Vite dev mode, `import.meta.hot` is defined; in production builds it's undefined.
const isDev = !!(import.meta as unknown as Record<string, unknown>).hot;

export function perfLog(label: string, value: number, extra?: Record<string, unknown>): void {
  if (!isDev) return;
  const rounded = Math.round(value * 100) / 100;
  const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
  console.debug(`[perf] ${label}: ${rounded}${suffix}`);
}

let renderCounters: Record<string, number> | null = isDev ? {} : null;

export function countRender(componentName: string): void {
  if (!renderCounters) return;
  renderCounters[componentName] = (renderCounters[componentName] ?? 0) + 1;
}

export function dumpRenderCounts(): Record<string, number> {
  return { ...(renderCounters ?? {}) };
}

export function resetRenderCounts(): void {
  if (renderCounters) {
    for (const key of Object.keys(renderCounters)) {
      delete renderCounters[key];
    }
  }
}
