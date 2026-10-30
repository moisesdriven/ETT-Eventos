import { toLimaDay } from "@ett/core";
import { sql } from "drizzle-orm";
import type { Ctx } from "../context";
import { fetchWalletCharges, upsertCharges } from "./wallet";
import { tsParam } from "../sql";

/**
 * Compara, por día de Lima, los cobros de WhatsApp del monedero de GHL con los de la BD.
 * Primero mide la diferencia y después completa lo que falte.
 */
export async function reconcile(ctx: Ctx, from: Date, to: Date) {
  const { charges } = await fetchWalletCharges(ctx, from, to);
  const api = new Map<string, { n: number; micros: number }>();
  for (const c of charges) {
    const day = toLimaDay(c.settledAt);
    const d = api.get(day) ?? { n: 0, micros: 0 };
    d.n++;
    d.micros += Math.round(Number(c.amountUsd) * 1e6);
    api.set(day, d);
  }

  const dbRows = await ctx.db.execute<{ day: string; n: number; total: string }>(sql`
    SELECT day_lima::text AS day, count(*)::int AS n, sum(amount_usd)::text AS total
      FROM analytics.message_charges
     WHERE location_id = ${ctx.locationId} AND source = 'ghl_wallet'
       AND settled_at >= ${tsParam(from)} AND settled_at < ${tsParam(to)}
     GROUP BY 1`);
  const dbMap = new Map(dbRows.map((r) => [r.day, { n: r.n, micros: Math.round(Number(r.total) * 1e6) }]));

  const days = [...new Set([...api.keys(), ...dbMap.keys()])].sort();
  const detalle = days.map((day) => {
    const a = api.get(day) ?? { n: 0, micros: 0 };
    const b = dbMap.get(day) ?? { n: 0, micros: 0 };
    return {
      dia: day,
      ghlCobros: a.n,
      ghlUsd: (a.micros / 1e6).toFixed(6),
      bdCobros: b.n,
      bdUsd: (b.micros / 1e6).toFixed(6),
      cuadra: a.n === b.n && a.micros === b.micros,
    };
  });
  const descuadres = detalle.filter((d) => !d.cuadra);
  if (descuadres.length) await upsertCharges(ctx, charges);
  return { dias: detalle.length, diasConDescuadre: descuadres.length, detalle, corregido: descuadres.length > 0 };
}
