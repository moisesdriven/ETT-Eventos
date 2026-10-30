import { addDays, limaDayStart, toLimaDay } from "@ett/core";
import { enqueueSyncRun, syncRuns, type SyncKind } from "@ett/db";
import { and, desc, eq, gte } from "drizzle-orm";
import type { Ctx } from "./context";
import { env } from "./env";
import { log } from "./log";

async function lastRunAt(ctx: Ctx, kind: SyncKind): Promise<Date | null> {
  const [row] = await ctx.db
    .select({ createdAt: syncRuns.createdAt })
    .from(syncRuns)
    .where(eq(syncRuns.kind, kind))
    .orderBy(desc(syncRuns.id))
    .limit(1);
  return row?.createdAt ?? null;
}

/** Programa la sincronización periódica y los trabajos diarios (hora de Lima). */
export async function scheduleDueJobs(ctx: Ctx, now = new Date()) {
  const last = await lastRunAt(ctx, "incremental");
  if (!last || now.getTime() - last.getTime() >= env.SYNC_INTERVAL_MINUTES * 60_000) {
    await enqueueSyncRun(ctx.db, { kind: "incremental", locationId: ctx.locationId, dedupe: true });
  }

  const today = toLimaDay(now);
  const dailyAt = new Date(limaDayStart(today).getTime() + env.DAILY_JOBS_HOUR_LIMA * 3_600_000);
  if (now < dailyAt) return;

  for (const kind of ["catalogo", "conciliacion"] as const) {
    const [doneToday] = await ctx.db
      .select({ id: syncRuns.id })
      .from(syncRuns)
      .where(and(eq(syncRuns.kind, kind), gte(syncRuns.createdAt, dailyAt)))
      .limit(1);
    if (doneToday) continue;
    // Conciliación de los últimos 7 días completos de Lima.
    const range = kind === "conciliacion" ? { rangeFrom: limaDayStart(addDays(today, -7)), rangeTo: limaDayStart(today) } : {};
    await enqueueSyncRun(ctx.db, { kind, locationId: ctx.locationId, dedupe: true, ...range });
    log("info", "Trabajo diario programado", { kind });
  }
}
