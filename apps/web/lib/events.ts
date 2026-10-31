import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";

export interface EventSummary {
  id: string;
  name: string;
  status: "activo" | "archivado";
  startsAt: Date;
  endsAt: Date;
  tags: string[];
  budgetUsd: string | null;
  notes: string | null;
  lastCalculatedAt: Date | null;
  contactosEtiqueta: number;
  contactosConGasto: number;
  conversaciones: number;
  numeros: string[];
  marketingN: number;
  marketingUsd: string;
  utilityN: number;
  utilityUsd: string;
  serviceN: number;
  serviceUsd: string;
  totalUsd: string;
}

/** Resumen por evento a partir de la atribución ya calculada. */
export async function listEventSummaries(locationId: string, eventId?: string): Promise<EventSummary[]> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    WITH ev AS (
      SELECT e.id, e.name, e.status, e.starts_at, e.ends_at, e.budget_usd, e.notes, e.last_calculated_at,
             array_agg(et.tag_name_normalized ORDER BY et.tag_name_normalized) AS tags
        FROM analytics.events e
        JOIN analytics.event_tags et ON et.event_id = e.id
       WHERE e.location_id = ${locationId} ${eventId ? sql`AND e.id = ${eventId}` : sql``}
       GROUP BY e.id
    ),
    agg AS (
      SELECT ca.event_id,
             count(DISTINCT mc.contact_id) FILTER (WHERE mc.amount_usd > 0) AS contactos_con_gasto,
             count(DISTINCT mc.conversation_id) AS conversaciones,
             array_remove(array_agg(DISTINCT p.phone_e164), NULL) AS numeros,
             count(*) FILTER (WHERE mc.category = 'marketing') AS marketing_n,
             coalesce(sum(ca.amount_usd) FILTER (WHERE mc.category = 'marketing'), 0) AS marketing_usd,
             count(*) FILTER (WHERE mc.category = 'utility') AS utility_n,
             coalesce(sum(ca.amount_usd) FILTER (WHERE mc.category = 'utility'), 0) AS utility_usd,
             count(*) FILTER (WHERE mc.category = 'service') AS service_n,
             coalesce(sum(ca.amount_usd) FILTER (WHERE mc.category = 'service'), 0) AS service_usd,
             coalesce(sum(ca.amount_usd), 0) AS total_usd
        FROM analytics.charge_attributions ca
        JOIN analytics.message_charges mc ON mc.id = ca.charge_id
        LEFT JOIN analytics.phone_numbers p ON p.id = mc.sender_phone_id
       WHERE ca.event_id IN (SELECT id FROM ev)
       GROUP BY ca.event_id
    )
    SELECT ev.*,
           (SELECT count(*) FROM analytics.contacts_cache cc WHERE cc.location_id = ${locationId} AND cc.tags && ev.tags)::int AS contactos_etiqueta,
           coalesce(agg.contactos_con_gasto, 0)::int AS contactos_con_gasto,
           coalesce(agg.conversaciones, 0)::int AS conversaciones,
           coalesce(agg.numeros, '{}') AS numeros,
           coalesce(agg.marketing_n, 0)::int AS marketing_n, coalesce(agg.marketing_usd, 0)::text AS marketing_usd,
           coalesce(agg.utility_n, 0)::int AS utility_n, coalesce(agg.utility_usd, 0)::text AS utility_usd,
           coalesce(agg.service_n, 0)::int AS service_n, coalesce(agg.service_usd, 0)::text AS service_usd,
           coalesce(agg.total_usd, 0)::text AS total_usd
      FROM ev LEFT JOIN agg ON agg.event_id = ev.id
     ORDER BY ev.starts_at DESC`);

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    status: r.status as EventSummary["status"],
    startsAt: new Date(r.starts_at as string),
    endsAt: new Date(r.ends_at as string),
    tags: r.tags as string[],
    budgetUsd: (r.budget_usd as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    lastCalculatedAt: r.last_calculated_at ? new Date(r.last_calculated_at as string) : null,
    contactosEtiqueta: Number(r.contactos_etiqueta),
    contactosConGasto: Number(r.contactos_con_gasto),
    conversaciones: Number(r.conversaciones),
    numeros: (r.numeros as string[]) ?? [],
    marketingN: Number(r.marketing_n),
    marketingUsd: String(r.marketing_usd),
    utilityN: Number(r.utility_n),
    utilityUsd: String(r.utility_usd),
    serviceN: Number(r.service_n),
    serviceUsd: String(r.service_usd),
    totalUsd: String(r.total_usd),
  }));
}
