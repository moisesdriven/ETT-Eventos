import { addDays, isIsoDay, limaDayStart } from "@ett/core";
import { createDb, enqueueSyncRun, SYNC_KINDS, type SyncKind } from "@ett/db";

/**
 * Encola un trabajo desde la consola del servidor.
 *   pnpm --filter @ett/worker enqueue backfill 2026-01-01 2026-10-31
 *   pnpm --filter @ett/worker enqueue catalogo
 *   pnpm --filter @ett/worker enqueue conciliacion 2026-10-01 2026-10-31
 * Las fechas son días de Lima, inclusive.
 */
const [kind, fromDay, toDay] = process.argv.slice(2);
if (!kind || !(SYNC_KINDS as readonly string[]).includes(kind)) {
  console.error(`Uso: enqueue <${SYNC_KINDS.join("|")}> [desde AAAA-MM-DD] [hasta AAAA-MM-DD]`);
  process.exit(1);
}
if ((fromDay && !isIsoDay(fromDay)) || (toDay && !isIsoDay(toDay))) {
  console.error("Las fechas deben tener formato AAAA-MM-DD");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL");
const db = createDb(url, { max: 1 });
const run = await enqueueSyncRun(db, {
  kind: kind as SyncKind,
  locationId: process.env.GHL_LOCATION_ID ?? null,
  rangeFrom: fromDay ? limaDayStart(fromDay) : null,
  rangeTo: toDay ? limaDayStart(addDays(toDay, 1)) : null,
});
console.log(`Trabajo #${run.id} (${run.kind}) en cola.`);
await db.$client.end();
