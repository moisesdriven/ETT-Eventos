import { sql } from "drizzle-orm";
import { csvResponse, requireExport, toCsv } from "@/lib/csv";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Detalle auditable de todas las transacciones atribuidas a un evento. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("No encontrado", { status: 404 });
  const user = await requireExport("evento_detalle", { eventId: id });
  if (user instanceof Response) return user;
  const rows = await db.execute<Record<string, string | number | null>>(sql`
    SELECT to_char(mc.settled_at AT TIME ZONE 'America/Lima', 'YYYY-MM-DD HH24:MI:SS') AS fecha_lima,
           mc.external_id, mc.charge_type, mc.category::text AS categoria,
           mc.amount_usd::text AS monto_cobro_usd, ca.share::text AS proporcion, ca.amount_usd::text AS monto_evento_usd, ca.basis::text AS base,
           mc.contact_id, cc.name AS contacto, cc.phone_e164 AS telefono_contacto, mc.conversation_id, mc.message_id, mc.message_ref AS wamid,
           p.phone_e164 AS numero_remitente
      FROM analytics.charge_attributions ca
      JOIN analytics.message_charges mc ON mc.id = ca.charge_id
      LEFT JOIN analytics.contacts_cache cc ON cc.location_id = mc.location_id AND cc.contact_id = mc.contact_id
      LEFT JOIN analytics.phone_numbers p ON p.id = mc.sender_phone_id
     WHERE ca.event_id = ${id}
     ORDER BY mc.settled_at`);
  const header = ["fecha_lima", "external_id", "charge_type", "categoria", "monto_cobro_usd", "proporcion", "monto_evento_usd", "base", "contact_id", "contacto", "telefono_contacto", "conversation_id", "message_id", "wamid", "numero_remitente"];
  return csvResponse(`evento-${id.slice(0, 8)}`, toCsv(header, rows.map((r) => header.map((h) => r[h]))));
}
