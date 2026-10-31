import "server-only";
import { addDays, diffDays, isIsoDay, normalizeTag, suggestActiveRange, toLimaDay, type IsoDay } from "@ett/core";
import { sql } from "drizzle-orm";
import type { SeriesPoint } from "./analytics";
import { db } from "./db";

export interface TagActivity {
  from: IsoDay;
  to: IsoDay;
  series: SeriesPoint[];
  contactos: number;
  totalUsd: number;
  sugerido: { from: IsoDay; to: IsoDay } | null;
}

/**
 * Gasto diario de los contactos que tienen alguna de las etiquetas, en una ventana
 * alrededor de la fecha de referencia (±60 días; sin fecha, los últimos 180 días).
 * Sirve para ver cuándo estuvo activo un evento y sugerir su rango.
 */
export async function getTagActivity(locationId: string, tags: string[], around: IsoDay | null): Promise<TagActivity | null> {
  const names = [...new Set(tags.map(normalizeTag))];
  if (!names.length) return null;
  const today = toLimaDay(new Date());
  let from = around && isIsoDay(around) ? addDays(around, -60) : addDays(today, -180);
  let to = around && isIsoDay(around) ? addDays(around, 60) : today;
  if (diffDays(to, today) < 0) to = today;
  if (diffDays(from, to) < 0) from = to;

  const tagList = sql.join(
    names.map((t) => sql`${t}`),
    sql`, `,
  );
  const rows = await db.execute<{ day: string; category: "marketing" | "utility" | "service"; n: number; usd: string; contactos: number }>(sql`
    SELECT mc.day_lima::text AS day, mc.category::text AS category, count(*)::int AS n, sum(mc.amount_usd)::text AS usd
      FROM analytics.message_charges mc
      JOIN analytics.contacts_cache cc ON cc.location_id = mc.location_id AND cc.contact_id = mc.contact_id
     WHERE mc.location_id = ${locationId}
       AND cc.tags && ARRAY[${tagList}]::text[]
       AND mc.category IN ('marketing', 'utility', 'service')
       AND mc.day_lima BETWEEN ${from}::date AND ${to}::date
     GROUP BY 1, 2`);
  const [cnt] = await db.execute<{ contactos: number }>(sql`
    SELECT count(DISTINCT mc.contact_id)::int AS contactos
      FROM analytics.message_charges mc
      JOIN analytics.contacts_cache cc ON cc.location_id = mc.location_id AND cc.contact_id = mc.contact_id
     WHERE mc.location_id = ${locationId} AND cc.tags && ARRAY[${tagList}]::text[]
       AND mc.category IN ('marketing', 'utility', 'service')
       AND mc.day_lima BETWEEN ${from}::date AND ${to}::date`);

  const map = new Map<string, SeriesPoint>();
  for (let d = from; diffDays(d, to) >= 0; d = addDays(d, 1)) {
    map.set(d, { bucket: d, marketing: { n: 0, usd: 0 }, utility: { n: 0, usd: 0 }, service: { n: 0, usd: 0 } });
  }
  let totalUsd = 0;
  for (const r of rows) {
    const p = map.get(r.day);
    if (!p) continue;
    p[r.category] = { n: r.n, usd: Number(r.usd) };
    totalUsd += Number(r.usd);
  }
  const series = [...map.values()];
  // El rango se sugiere con los envíos de campaña (marketing y utilidad); si no hay, con todos.
  const campaign = series.map((p) => ({ day: p.bucket, weight: p.marketing.n + p.utility.n }));
  const anchor = around && isIsoDay(around) ? around : null;
  const sugerido =
    suggestActiveRange(campaign, { anchor }) ??
    suggestActiveRange(series.map((p) => ({ day: p.bucket, weight: p.marketing.n + p.utility.n + p.service.n })), { anchor });
  return { from, to, series, contactos: cnt?.contactos ?? 0, totalUsd, sugerido };
}
