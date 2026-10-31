import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./index";
import { syncRuns } from "./schema";

/**
 * Cola de trabajos sobre `analytics.sync_runs`. La misma tabla sirve de log de
 * sincronización visible en la app. Un solo worker toma trabajos con
 * FOR UPDATE SKIP LOCKED.
 */
export const SYNC_KINDS = ["incremental", "backfill", "catalogo", "evento", "conciliacion", "reparacion"] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];

export const SYNC_KIND_LABELS: Record<SyncKind, string> = {
  incremental: "Sincronización periódica",
  backfill: "Carga histórica",
  catalogo: "Catálogo de etiquetas y contactos",
  evento: "Cálculo de evento",
  conciliacion: "Conciliación con el monedero",
  reparacion: "Reparación de cobros sin cruzar",
};

export type SyncRun = typeof syncRuns.$inferSelect;

export async function enqueueSyncRun(
  db: Database,
  input: {
    kind: SyncKind;
    locationId?: string | null;
    rangeFrom?: Date | null;
    rangeTo?: Date | null;
    params?: Record<string, unknown>;
    requestedBy?: string | null;
    /** Si ya hay uno igual en cola, no se duplica. */
    dedupe?: boolean;
  },
): Promise<SyncRun> {
  if (input.dedupe) {
    const [existing] = await db
      .select()
      .from(syncRuns)
      .where(and(eq(syncRuns.kind, input.kind), eq(syncRuns.status, "en_cola")))
      .limit(1);
    if (existing) return existing;
  }
  const [run] = await db
    .insert(syncRuns)
    .values({
      kind: input.kind,
      locationId: input.locationId ?? null,
      rangeFrom: input.rangeFrom ?? null,
      rangeTo: input.rangeTo ?? null,
      params: input.params ?? null,
      requestedBy: input.requestedBy ?? null,
    })
    .returning();
  return run!;
}

export async function claimNextSyncRun(db: Database): Promise<SyncRun | null> {
  const rows = await db.execute<{ id: number }>(sql`
    UPDATE ${syncRuns} SET status = 'en_proceso', started_at = now()
    WHERE id = (
      SELECT id FROM ${syncRuns} WHERE status = 'en_cola' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id`);
  const id = rows[0]?.id;
  if (id === undefined) return null;
  const [run] = await db.select().from(syncRuns).where(eq(syncRuns.id, Number(id)));
  return run ?? null;
}

export async function finishSyncRun(db: Database, id: number, result: { ok: boolean; stats?: Record<string, unknown>; error?: string }) {
  await db
    .update(syncRuns)
    .set({ status: result.ok ? "ok" : "error", finishedAt: sql`now()`, stats: result.stats ?? null, error: result.error?.slice(0, 2000) ?? null })
    .where(eq(syncRuns.id, id));
}

export async function updateSyncRunStats(db: Database, id: number, stats: Record<string, unknown>) {
  await db.update(syncRuns).set({ stats }).where(eq(syncRuns.id, id));
}

/** Al arrancar el worker, los trabajos que quedaron a medias se marcan como interrumpidos. */
export async function failInterruptedRuns(db: Database) {
  await db
    .update(syncRuns)
    .set({ status: "error", finishedAt: sql`now()`, error: "Interrumpido: el worker se reinició" })
    .where(inArray(syncRuns.status, ["en_proceso"]));
}
