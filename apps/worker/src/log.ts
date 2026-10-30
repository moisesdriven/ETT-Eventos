/** Logs en una línea JSON (sin tokens). */
export function log(level: "info" | "warn" | "error", msg: string, data: Record<string, unknown> = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...data });
  (level === "error" ? console.error : console.log)(line);
}
