import "server-only";
import { addDays, diffDays, toLimaDay } from "@ett/core";
import { sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import type { Filters } from "./filters";

/**
 * CTE `f`: cobros filtrados con su monto efectivo.
 * - Sin filtro de evento: monto completo del cobro (cuadra con el monedero).
 * - Con evento: solo la parte atribuida a ese evento.
 * - «organico»: cobros sin ninguna atribución.
 */
function filtered(locationId: string, f: Filters): SQL {
  const byEvent = f.event && f.event !== "organico";
  const cats = sql.join(
    f.categories.map((c) => sql`${c}`),
    sql`, `,
  );
  return sql`f AS (
    SELECT mc.id, mc.day_lima, mc.settled_at, mc.category::text AS category, mc.contact_id, mc.conversation_id, mc.sender_phone_id,
           ${byEvent ? sql`ca.amount_usd` : sql`mc.amount_usd`} AS amt
      FROM analytics.message_charges mc
      ${byEvent ? sql`JOIN analytics.charge_attributions ca ON ca.charge_id = mc.id AND ca.event_id = ${f.event}` : sql``}
     WHERE mc.location_id = ${locationId}
       AND mc.day_lima BETWEEN ${f.from}::date AND ${f.to}::date
       AND mc.category::text IN (${cats})
       ${f.phoneId ? sql`AND mc.sender_phone_id = ${f.phoneId}` : sql``}
       ${f.event === "organico" ? sql`AND NOT EXISTS (SELECT 1 FROM analytics.charge_attributions x WHERE x.charge_id = mc.id)` : sql``}
  )`;
}

export interface CategoryTotals {
  marketing: { n: number; usd: number };
  utility: { n: number; usd: number };
  service: { n: number; usd: number };
}

export interface Kpis extends CategoryTotals {
  totalUsd: number;
  mensajes: number;
  contactos: number;
  conversaciones: number;
}

const num = (v: unknown) => Number(v ?? 0);

export async function getKpis(locationId: string, f: Filters): Promise<Kpis> {
  const [r] = await db.execute<Record<string, unknown>>(sql`
    WITH ${filtered(locationId, f)}
    SELECT coalesce(sum(amt), 0)::text AS total, count(*)::int AS n,
           count(DISTINCT contact_id)::int AS contactos, count(DISTINCT conversation_id)::int AS conversaciones,
           count(*) FILTER (WHERE category = 'marketing')::int AS mk_n, coalesce(sum(amt) FILTER (WHERE category = 'marketing'), 0)::text AS mk_usd,
           count(*) FILTER (WHERE category = 'utility')::int AS ut_n, coalesce(sum(amt) FILTER (WHERE category = 'utility'), 0)::text AS ut_usd,
           count(*) FILTER (WHERE category = 'service')::int AS sv_n, coalesce(sum(amt) FILTER (WHERE category = 'service'), 0)::text AS sv_usd
      FROM f`);
  return {
    totalUsd: num(r?.total),
    mensajes: num(r?.n),
    contactos: num(r?.contactos),
    conversaciones: num(r?.conversaciones),
    marketing: { n: num(r?.mk_n), usd: num(r?.mk_usd) },
    utility: { n: num(r?.ut_n), usd: num(r?.ut_usd) },
    service: { n: num(r?.sv_n), usd: num(r?.sv_usd) },
  };
}

export interface SeriesPoint extends CategoryTotals {
  bucket: string;
}

function emptyTotals(): CategoryTotals {
  return { marketing: { n: 0, usd: 0 }, utility: { n: 0, usd: 0 }, service: { n: 0, usd: 0 } };
}

/** Serie por día o por mes (días de Lima), con todos los periodos aunque estén en cero. */
export async function getTimeSeries(locationId: string, f: Filters): Promise<SeriesPoint[]> {
  const bucket = f.granularity === "mes" ? sql`to_char(day_lima, 'YYYY-MM')` : sql`day_lima::text`;
  const rows = await db.execute<{ bucket: string; category: keyof CategoryTotals; n: number; usd: string }>(sql`
    WITH ${filtered(locationId, f)}
    SELECT ${bucket} AS bucket, category, count(*)::int AS n, sum(amt)::text AS usd
      FROM f GROUP BY 1, 2`);

  const buckets: string[] = [];
  if (f.granularity === "mes") {
    for (let d = f.from; diffDays(d, f.to) >= 0; ) {
      const key = d.slice(0, 7);
      if (!buckets.includes(key)) buckets.push(key);
      d = addDays(`${key}-01`, 32).slice(0, 7) + "-01";
    }
  } else {
    for (let d = f.from; diffDays(d, f.to) >= 0; d = addDays(d, 1)) buckets.push(d);
  }
  const map = new Map(buckets.map((b) => [b, { bucket: b, ...emptyTotals() } as SeriesPoint]));
  for (const r of rows) {
    const point = map.get(r.bucket);
    if (point && point[r.category]) point[r.category] = { n: r.n, usd: Number(r.usd) };
  }
  return [...map.values()];
}

export interface PhoneRow extends CategoryTotals {
  phoneId: number | null;
  phone: string;
  label: string | null;
  totalUsd: number;
  mensajes: number;
  contactos: number;
  conversaciones: number;
  eventos: number;
}

export async function getByPhone(locationId: string, f: Filters): Promise<PhoneRow[]> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    WITH ${filtered(locationId, f)}
    SELECT f.sender_phone_id AS phone_id, p.phone_e164 AS phone, p.label,
           coalesce(sum(amt), 0)::text AS total, count(*)::int AS n,
           count(DISTINCT f.contact_id)::int AS contactos, count(DISTINCT f.conversation_id)::int AS conversaciones,
           (SELECT count(DISTINCT ca.event_id) FROM analytics.charge_attributions ca JOIN f f2 ON f2.id = ca.charge_id
             WHERE f2.sender_phone_id IS NOT DISTINCT FROM f.sender_phone_id)::int AS eventos,
           count(*) FILTER (WHERE category = 'marketing')::int AS mk_n, coalesce(sum(amt) FILTER (WHERE category = 'marketing'), 0)::text AS mk_usd,
           count(*) FILTER (WHERE category = 'utility')::int AS ut_n, coalesce(sum(amt) FILTER (WHERE category = 'utility'), 0)::text AS ut_usd,
           count(*) FILTER (WHERE category = 'service')::int AS sv_n, coalesce(sum(amt) FILTER (WHERE category = 'service'), 0)::text AS sv_usd
      FROM f LEFT JOIN analytics.phone_numbers p ON p.id = f.sender_phone_id
     GROUP BY f.sender_phone_id, p.phone_e164, p.label
     ORDER BY sum(amt) DESC NULLS LAST`);
  return rows.map((r) => ({
    phoneId: r.phone_id === null ? null : num(r.phone_id),
    phone: (r.phone as string | null) ?? "Sin número",
    label: (r.label as string | null) ?? null,
    totalUsd: num(r.total),
    mensajes: num(r.n),
    contactos: num(r.contactos),
    conversaciones: num(r.conversaciones),
    eventos: num(r.eventos),
    marketing: { n: num(r.mk_n), usd: num(r.mk_usd) },
    utility: { n: num(r.ut_n), usd: num(r.ut_usd) },
    service: { n: num(r.sv_n), usd: num(r.sv_usd) },
  }));
}

export interface EventSpendRow extends CategoryTotals {
  eventId: string | null;
  name: string;
  totalUsd: number;
  contactos: number;
}

/** Gasto por evento en el periodo (top N) y el orgánico, usando la parte atribuida. */
export async function getTopEvents(locationId: string, f: Filters, limit = 10): Promise<{ top: EventSpendRow[]; organico: EventSpendRow }> {
  const base = { ...f, event: null };
  const rows = await db.execute<Record<string, unknown>>(sql`
    WITH ${filtered(locationId, base)},
    parts AS (
      SELECT ca.event_id, f.category, f.contact_id, ca.amount_usd AS amt
        FROM f JOIN analytics.charge_attributions ca ON ca.charge_id = f.id
      UNION ALL
      SELECT NULL, f.category, f.contact_id, f.amt
        FROM f WHERE NOT EXISTS (SELECT 1 FROM analytics.charge_attributions x WHERE x.charge_id = f.id)
    )
    SELECT parts.event_id, e.name, coalesce(sum(amt), 0)::text AS total, count(DISTINCT contact_id)::int AS contactos,
           count(*) FILTER (WHERE category = 'marketing')::int AS mk_n, coalesce(sum(amt) FILTER (WHERE category = 'marketing'), 0)::text AS mk_usd,
           count(*) FILTER (WHERE category = 'utility')::int AS ut_n, coalesce(sum(amt) FILTER (WHERE category = 'utility'), 0)::text AS ut_usd,
           count(*) FILTER (WHERE category = 'service')::int AS sv_n, coalesce(sum(amt) FILTER (WHERE category = 'service'), 0)::text AS sv_usd
      FROM parts LEFT JOIN analytics.events e ON e.id = parts.event_id
     GROUP BY parts.event_id, e.name
     ORDER BY sum(amt) DESC`);
  const mapped = rows.map((r) => ({
    eventId: (r.event_id as string | null) ?? null,
    name: (r.name as string | null) ?? "Orgánico / Sin campaña",
    totalUsd: num(r.total),
    contactos: num(r.contactos),
    marketing: { n: num(r.mk_n), usd: num(r.mk_usd) },
    utility: { n: num(r.ut_n), usd: num(r.ut_usd) },
    service: { n: num(r.sv_n), usd: num(r.sv_usd) },
  }));
  const organico = mapped.find((r) => r.eventId === null) ?? { eventId: null, name: "Orgánico / Sin campaña", totalUsd: 0, contactos: 0, ...emptyTotals() };
  return { top: mapped.filter((r) => r.eventId !== null).slice(0, limit), organico };
}

export interface WalletStatus {
  balanceUsd: number | null;
  balanceAt: Date | null;
  avgDaily7d: number;
  daysLeft: number | null;
}

/**
 * Saldo según el último cobro de la subcuenta (GHL no expone el saldo por API para
 * esta subcuenta) y proyección con el gasto promedio de los últimos 7 días completos.
 */
export async function getWalletStatus(locationId: string): Promise<WalletStatus> {
  const [last] = await db.execute<{ balance: string | null; settled_at: Date }>(sql`
    SELECT raw_payload->>'totalBalance' AS balance, settled_at
      FROM analytics.message_charges
     WHERE location_id = ${locationId} AND raw_payload ? 'totalBalance'
     ORDER BY settled_at DESC LIMIT 1`);
  const today = toLimaDay(new Date());
  const [avg] = await db.execute<{ total: string | null }>(sql`
    SELECT sum(amount_usd)::text AS total FROM analytics.message_charges
     WHERE location_id = ${locationId} AND day_lima BETWEEN ${addDays(today, -7)}::date AND ${addDays(today, -1)}::date`);
  const balance = last?.balance != null && Number.isFinite(Number(last.balance)) ? Number(last.balance) : null;
  const avgDaily7d = Number(avg?.total ?? 0) / 7;
  return {
    balanceUsd: balance,
    balanceAt: last?.settled_at ? new Date(last.settled_at) : null,
    avgDaily7d,
    daysLeft: balance !== null && avgDaily7d > 0 ? balance / avgDaily7d : null,
  };
}

export async function getFilterOptions(locationId: string) {
  const phones = await db.execute<{ id: number; phone: string; label: string | null }>(sql`
    SELECT id, phone_e164 AS phone, label FROM analytics.phone_numbers WHERE location_id = ${locationId} ORDER BY phone_e164`);
  const evs = await db.execute<{ id: string; name: string }>(sql`
    SELECT id, name FROM analytics.events WHERE location_id = ${locationId} ORDER BY starts_at DESC`);
  return { phones: [...phones], events: [...evs] };
}

/** Gasto mensual por número (filas número × mes) y eventos que corrieron por cada número. */
export async function getPhoneBreakdown(locationId: string, f: Filters) {
  const monthly = await db.execute<{ phone_id: number | null; month: string; usd: string; contactos: number }>(sql`
    WITH ${filtered(locationId, f)}
    SELECT sender_phone_id AS phone_id, to_char(day_lima, 'YYYY-MM') AS month, sum(amt)::text AS usd, count(DISTINCT contact_id)::int AS contactos
      FROM f GROUP BY 1, 2 ORDER BY 2`);
  const evs = await db.execute<{ phone_id: number | null; event_id: string; name: string; usd: string }>(sql`
    WITH ${filtered(locationId, { ...f, event: null })}
    SELECT f.sender_phone_id AS phone_id, e.id AS event_id, e.name, sum(ca.amount_usd)::text AS usd
      FROM f JOIN analytics.charge_attributions ca ON ca.charge_id = f.id JOIN analytics.events e ON e.id = ca.event_id
     GROUP BY 1, 2, 3 ORDER BY sum(ca.amount_usd) DESC`);
  return { monthly: [...monthly], events: [...evs] };
}
