/**
 * Ventana deslizante: como máximo `limit` llamadas cada `windowMs` por clave.
 * GHL permite 100 solicitudes / 10 s por subcuenta; usamos 80 por margen.
 */
export class SlidingWindowLimiter {
  private readonly calls = new Map<string, number[]>();

  constructor(
    private readonly limit = 80,
    private readonly windowMs = 10_000,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async acquire(key: string): Promise<void> {
    for (;;) {
      const t = this.now();
      const recent = (this.calls.get(key) ?? []).filter((c) => t - c < this.windowMs);
      if (recent.length < this.limit) {
        recent.push(t);
        this.calls.set(key, recent);
        return;
      }
      this.calls.set(key, recent);
      await this.sleep(this.windowMs - (t - recent[0]!) + 5);
    }
  }
}
