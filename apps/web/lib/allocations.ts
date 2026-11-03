import "server-only";
import { addDays } from "@ett/core";
import { eventMonthAllocations } from "@ett/db";
import { and, eq } from "drizzle-orm";
import type { AllocationRow } from "@/components/allocation/allocation-table";
import { getTopEvents } from "./analytics";
import { db } from "./db";
import { FILTER_CATEGORIES, type Filters } from "./filters";

/** Mes (AAAA-MM) si el filtro cae dentro de un solo mes calendario; si no, null. */
export function singleMonth(f: Filters): string | null {
  return f.from.slice(0, 7) === f.to.slice(0, 7) ? f.from.slice(0, 7) : null;
}

/**
 * Gasto de cada evento en el mes (todas las categorías y números) con su % calculado y,
 * si existe, el % guardado a mano.
 */
export async function getMonthAllocation(locationId: string, month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const f: Filters = {
    from: `${month}-01`,
    to: addDays(next, -1),
    preset: null,
    month,
    phoneId: null,
    categories: [...FILTER_CATEGORIES],
    event: null,
    granularity: "dia",
  };
  const [{ top, organico, total }, saved] = await Promise.all([
    getTopEvents(locationId, f, 1000),
    db
      .select({ eventId: eventMonthAllocations.eventId, pct: eventMonthAllocations.pct })
      .from(eventMonthAllocations)
      .where(and(eq(eventMonthAllocations.locationId, locationId), eq(eventMonthAllocations.month, month))),
  ]);
  const guardado = new Map(saved.map((s) => [s.eventId, Number(s.pct)]));
  const rows: AllocationRow[] = top
    .filter((e): e is typeof e & { eventId: string } => e.eventId !== null)
    .map((e) => ({
      eventId: e.eventId,
      name: e.name,
      usd: e.totalUsd,
      calcPct: total ? (e.totalUsd / total) * 100 : 0,
      savedPct: guardado.get(e.eventId) ?? null,
    }));
  return { rows, total, organicUsd: organico.totalUsd };
}
