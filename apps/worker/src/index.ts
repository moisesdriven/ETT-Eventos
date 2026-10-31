import { claimNextSyncRun, failInterruptedRuns, finishSyncRun } from "@ett/db";
import { createContext } from "./context";
import { runJob } from "./jobs";
import { log } from "./log";
import { scheduleDueJobs } from "./scheduler";
import { processWebhooks } from "./steps/webhooks";

const POLL_MS = 5_000;

/** Prioriza la causa (p. ej. el error de PostgreSQL) sobre el texto de la consulta. */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause instanceof Error ? err.cause.message : undefined;
  return cause ? `${cause} — ${err.message.slice(0, 300)}` : err.message;
}
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log("info", "Deteniendo worker tras el trabajo actual", { signal });
    stopping = true;
  });
}

const ctx = await createContext();
await failInterruptedRuns(ctx.db);
log("info", "Worker iniciado");

while (!stopping) {
  try {
    await scheduleDueJobs(ctx);
    // Los avisos de etiquetas se procesan antes que los trabajos largos para no atrasarse.
    await processWebhooks(ctx);
    const run = await claimNextSyncRun(ctx.db);
    if (!run) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }
    const started = Date.now();
    log("info", "Trabajo iniciado", { run: run.id, kind: run.kind });
    try {
      const stats = await runJob(ctx, run);
      await finishSyncRun(ctx.db, run.id, { ok: true, stats: { ...stats, duracionSeg: Math.round((Date.now() - started) / 1000) } });
      log("info", "Trabajo completado", { run: run.id, kind: run.kind, seg: Math.round((Date.now() - started) / 1000) });
    } catch (err) {
      const message = describeError(err);
      await finishSyncRun(ctx.db, run.id, { ok: false, error: message });
      log("error", "Trabajo con error", { run: run.id, kind: run.kind, error: message });
    }
  } catch (err) {
    log("error", "Error del ciclo principal", { error: err instanceof Error ? err.message : String(err) });
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
await ctx.db.$client.end();
