import { describe, expect, it, vi } from "vitest";
import { createHttp, GhlError } from "./http";
import { SlidingWindowLimiter } from "./rate-limiter";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("SlidingWindowLimiter", () => {
  it("espera cuando se alcanza el límite de la ventana", async () => {
    let now = 0;
    const waits: number[] = [];
    const limiter = new SlidingWindowLimiter(2, 10_000, () => now, async (ms) => {
      waits.push(ms);
      now += ms;
    });
    await limiter.acquire("a");
    await limiter.acquire("a");
    await limiter.acquire("b"); // otra clave no espera
    expect(waits).toEqual([]);
    now = 3_000;
    await limiter.acquire("a");
    expect(waits).toEqual([7_005]);
  });
});

describe("createHttp", () => {
  const sleep = vi.fn(async () => {});
  const base = { method: "GET" as const, path: "/x", token: "pit-secreto", rateKey: "k" };

  it("reintenta 429 y 5xx con backoff y luego responde", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(429, {}, { "retry-after": "2" }))
      .mockResolvedValueOnce(json(502, {}))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const request = createHttp({ fetch: fetchMock, sleep, limiter: new SlidingWindowLimiter(1000) });
    await expect(request(base)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
  });

  it("no reintenta 4xx y no expone el token en el error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(401, { message: "Unauthorized" }));
    const request = createHttp({ fetch: fetchMock, sleep, limiter: new SlidingWindowLimiter(1000) });
    const err = await request(base).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GhlError);
    expect((err as GhlError).status).toBe(401);
    expect(String((err as Error).message)).not.toContain("pit-secreto");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("envía Version y Authorization", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(200, {}));
    const request = createHttp({ fetch: fetchMock, sleep, limiter: new SlidingWindowLimiter(1000) });
    await request({ ...base, version: "v3", query: { a: 1, b: undefined } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://services.leadconnectorhq.com/x?a=1");
    expect((init?.headers as Record<string, string>).Version).toBe("v3");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer pit-secreto");
  });

  it("se rinde tras el máximo de reintentos", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(503, {}));
    const request = createHttp({ fetch: fetchMock, sleep, maxRetries: 2, limiter: new SlidingWindowLimiter(1000) });
    await expect(request(base)).rejects.toBeInstanceOf(GhlError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
