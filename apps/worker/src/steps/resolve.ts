import { sql } from "drizzle-orm";
import type { Ctx } from "../context";
import { tsParam } from "../sql";

/**
 * Cruza cada cobro con su mensaje por wamid (`ref:` del cobro = `altId` del mensaje).
 * Los cobros que siguen sin mensaje 6 horas después se marcan "sin_resolver";
 * nunca se descartan, así el total sigue cuadrando con el monedero.
 */
export async function resolveCharges(ctx: Ctx, from: Date, to: Date) {
  const resolved = await ctx.db.execute(sql`
    UPDATE analytics.message_charges mc
       SET message_id = m.message_id,
           conversation_id = m.conversation_id,
           contact_id = m.contact_id,
           sender_phone_id = m.sender_phone_id,
           resolution = 'resuelto',
           updated_at = now()
      FROM (
        -- GHL a veces registra dos mensajes con el mismo wamid: se toma el más antiguo con contacto.
        SELECT DISTINCT ON (alt_id) alt_id, message_id, conversation_id, contact_id, sender_phone_id
          FROM analytics.messages_cache
         WHERE location_id = ${ctx.locationId} AND alt_id IS NOT NULL
         ORDER BY alt_id, (contact_id IS NULL), sent_at, message_id
      ) m
     WHERE mc.location_id = ${ctx.locationId}
       AND mc.resolution <> 'resuelto'
       AND mc.message_ref IS NOT NULL
       AND m.alt_id = mc.message_ref`);

  const unresolved = await ctx.db.execute(sql`
    UPDATE analytics.message_charges
       SET resolution = 'sin_resolver', updated_at = now()
     WHERE location_id = ${ctx.locationId}
       AND resolution = 'pendiente'
       AND settled_at >= ${tsParam(from)} AND settled_at < ${tsParam(to)}
       AND settled_at < now() - interval '6 hours'`);

  return { cobrosResueltos: resolved.count, cobrosSinResolver: unresolved.count };
}
