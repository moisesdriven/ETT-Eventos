import { parseTagWebhook } from "@ett/core";
import { webhookEvents } from "@ett/db";
import type { GhlContact } from "@ett/ghl";
import { asc, eq, isNull, sql } from "drizzle-orm";
import type { Ctx } from "../context";
import { log } from "../log";
import { saveContactSnapshot } from "./contacts";

/**
 * Procesa los avisos de etiquetas pendientes, en el orden en que llegaron. Si el aviso
 * no trae las etiquetas actuales, se consulta el contacto en GHL.
 */
export async function processWebhooks(ctx: Ctx, limit = 200): Promise<number> {
  const pending = await ctx.db
    .select()
    .from(webhookEvents)
    .where(isNull(webhookEvents.processedAt))
    .orderBy(asc(webhookEvents.id))
    .limit(limit);

  for (const ev of pending) {
    let error: string | null = null;
    try {
      const parsed = parseTagWebhook(ev.payload);
      if (!parsed) throw new Error("Aviso sin contacto válido");
      if (parsed.locationId && parsed.locationId !== ctx.locationId) throw new Error(`Aviso de otra subcuenta (${parsed.locationId})`);

      let contact: GhlContact | null;
      if (parsed.tags) {
        contact = { id: parsed.contactId, tags: parsed.tags, dateAdded: parsed.contactCreatedAt?.toISOString() ?? null };
        // Nombre y teléfono se completan después con la sincronización normal.
        const [existing] = await ctx.db.execute<{ name: string | null; phone_e164: string | null }>(sql`
          SELECT name, phone_e164 FROM analytics.contacts_cache WHERE location_id = ${ctx.locationId} AND contact_id = ${parsed.contactId}`);
        if (!existing) contact = (await ctx.ghl.getContact(parsed.contactId)) ?? contact;
        else contact = { ...contact, contactName: existing.name, phone: existing.phone_e164 };
      } else {
        contact = await ctx.ghl.getContact(parsed.contactId);
      }
      if (!contact) throw new Error("El contacto ya no existe en GHL");
      // Las etiquetas del aviso son las del momento del cambio: mandan sobre la consulta posterior.
      if (parsed.tags) contact = { ...contact, tags: parsed.tags };
      await saveContactSnapshot(ctx, contact, ev.receivedAt, { source: "webhook" });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      log("warn", "Aviso de GHL no procesado", { id: ev.id, error });
    }
    await ctx.db.update(webhookEvents).set({ processedAt: sql`now()`, error }).where(eq(webhookEvents.id, ev.id));
  }
  return pending.length;
}
