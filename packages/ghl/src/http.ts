import { SlidingWindowLimiter } from "./rate-limiter";

export const GHL_BASE_URL = "https://services.leadconnectorhq.com";

export class GhlError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "GhlError";
  }
}

export interface GhlRequest {
  method: "GET" | "POST";
  path: string;
  token: string;
  /** Clave para el límite de llamadas (una por token/subcuenta). */
  rateKey: string;
  version?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export interface HttpOptions {
  fetch?: typeof fetch;
  limiter?: SlidingWindowLimiter;
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: { path: string; status: number; attempt: number; delayMs: number }) => void;
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export function createHttp(options: HttpOptions = {}) {
  const doFetch = options.fetch ?? fetch;
  const limiter = options.limiter ?? new SlidingWindowLimiter();
  const maxRetries = options.maxRetries ?? 6;
  const baseDelay = options.baseDelayMs ?? 1000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  return async function request<T>(req: GhlRequest): Promise<T> {
    const url = new URL(req.path, GHL_BASE_URL);
    for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

    for (let attempt = 0; ; attempt++) {
      await limiter.acquire(req.rateKey);
      let status = 0;
      let text = "";
      let retryAfterMs: number | undefined;
      try {
        const res = await doFetch(url, {
          method: req.method,
          headers: {
            Authorization: `Bearer ${req.token}`,
            Version: req.version ?? "2021-07-28",
            Accept: "application/json",
            ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
          signal: AbortSignal.timeout(60_000),
        });
        status = res.status;
        text = await res.text();
        const ra = Number(res.headers.get("retry-after"));
        if (Number.isFinite(ra) && ra > 0) retryAfterMs = ra * 1000;
        if (res.ok) return (text ? JSON.parse(text) : {}) as T;
      } catch (err) {
        // Error de red o timeout: se reintenta igual que un 5xx.
        status = 0;
        text = err instanceof Error ? err.message : String(err);
      }

      if ((status === 0 || RETRYABLE.has(status)) && attempt < maxRetries) {
        const delayMs = retryAfterMs ?? Math.min(60_000, baseDelay * 2 ** attempt) * (0.5 + Math.random() / 2);
        options.onRetry?.({ path: req.path, status, attempt: attempt + 1, delayMs });
        await sleep(delayMs);
        continue;
      }
      // Nunca incluir el token en el error.
      throw new GhlError(`GHL ${req.method} ${req.path} respondió ${status || "sin conexión"}`, status, text.slice(0, 1000));
    }
  };
}

export type HttpRequest = ReturnType<typeof createHttp>;
