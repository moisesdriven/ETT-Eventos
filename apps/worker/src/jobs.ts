import { addDays, limaDayStart, toLimaDay } from "@ett/core";
import { eventTags, events, updateSyncRunStats, type SyncKind, type SyncRun } from "@ett/db";
import { eq } from "drizzle-orm";
import type { Ctx } from "./context";
import { log } from "./log";
import { recalculateAttributions } from "./steps/attribution";
import { syncCatalog } from "./steps/catalog";
import { syncContactsWithTags, syncMissingContacts } from "./steps/contacts";
import { syncMessages } from "./steps/messages";
import { reconcile } from "./steps/reconcile";
import { repairUnresolved } from "./steps/repair";
import { resolveCharges } from "./steps/resolve";
import { syncWallet } from "./steps/wallet";
import { processWebhooks } from "./steps/webhooks";

const HOUR = 60 * 60 * 1000;
type Stats = Record<string, unknown>;

/** Cobros → mensajes → cruce → contactos → atribución, para un rango. */
async function syncRange(ctx: Ctx, from: Date, to: Date): Promise<Stats> {
  const wallet = await syncWallet(ctx, from, to);
  // Los mensajes se registran segundos antes que su cobro: se amplía el rango.
  const messages = await syncMessages(ctx, new Date(from.getTime() - 2 * HOUR), to);
  const resolved = await resolveCharges(ctx, from, to);
  const contacts = await syncMissingContacts(ctx, from, to);
  const attribution = await recalculateAttributions(ctx, from, to);
  return { ...wallet, ...messages, ...resolved, ...contacts, ...attribution };
}

/** Divide un rango largo en tramos de días de Lima, para avanzar y registrar progreso. */
function chunks(from: Date, to: Date, days: number): [Date, Date][] {
  const out: [Date, Date][] = [];
  let start = from;
  while (start < to) {
    const next = limaDayStart(addDays(toLimaDay(start), days));
    const end = next < to ? next : to;
    out.push([start, end]);
    start = end;
  }
  return out;
}

function sumStats(acc: Stats, s: Stats): Stats {
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === "number") acc[k] = ((acc[k] as number) ?? 0) + v;
    else if (Array.isArray(v)) acc[k] = [...new Set([...((acc[k] as unknown[]) ?? []), ...v])];
  }
  return acc;
}

function requireRange(run: SyncRun): [Date, Date] {
  if (!run.rangeFrom || !run.rangeTo) throw new Error("El trabajo no tiene rango de fechas");
  const to = run.rangeTo > new Date() ? new Date() : run.rangeTo;
  return [run.rangeFrom, to];
}

async function runChunked(ctx: Ctx, run: SyncRun, from: Date, to: Date, days: number): Promise<Stats> {
  const parts = chunks(from, to, days);
  const acc: Stats = { tramos: parts.length };
  for (const [i, [a, b]] of parts.entries()) {
    // Entre tramos se atienden los avisos de etiquetas para no perder su hora exacta.
    await processWebhooks(ctx);
    sumStats(acc, await syncRange(ctx, a, b));
    acc.tramosCompletados = i + 1;
    await updateSyncRunStats(ctx.db, run.id, acc);
    log("info", "Tramo completado", { run: run.id, desde: a.toISOString(), hasta: b.toISOString() });
  }
  return acc;
}

export async function runJob(ctx: Ctx, run: SyncRun): Promise<Stats> {
  switch (run.kind as SyncKind) {
    case "incremental": {
      const to = new Date();
      return syncRange(ctx, new Date(to.getTime() - 48 * HOUR), to);
    }
    case "backfill": {
      const [from, to] = requireRange(run);
      const stats = await runChunked(ctx, run, from, to, 7);
      // Reintenta los días en que GHL respondió sin mensajes.
      return { ...stats, reparacion: await repairUnresolved(ctx, from, to) };
    }
    case "reparacion":
      return repairUnresolved(ctx, run.rangeFrom, run.rangeTo);
    case "catalogo":
      return syncCatalog(ctx);
    case "conciliacion": {
      const [from, to] = requireRange(run);
      const result = await reconcile(ctx, from, to);
      // Si faltaban cobros, se completa el rango (mensajes, cruce, contactos y atribución).
      if (!result.corregido) return result;
      return { ...result, resincronizacion: await runChunked(ctx, run, from, to, 7) };
    }
    case "evento": {
      const eventId = String(run.params?.eventId ?? "");
      const [from, to] = requireRange(run);
      const tagRows = eventId
        ? await ctx.db
            .select({ tag: eventTags.tagNameNormalized })
            .from(eventTags)
            .innerJoin(events, eq(events.id, eventTags.eventId))
            .where(eq(events.id, eventId))
        : [];
      const contacts = await syncContactsWithTags(ctx, tagRows.map((r) => r.tag));
      const synced = await runChunked(ctx, run, from, to, 7);
      return { ...contacts, ...synced };
    }
    default:
      throw new Error(`Tipo de trabajo desconocido: ${run.kind}`);
  }
}
