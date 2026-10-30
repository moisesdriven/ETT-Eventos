import { normalizePhone, normalizeTag } from "@ett/core";
import { contactsCache, contactTagHistory } from "@ett/db";
import type { GhlContact } from "@ett/ghl";
import { and, arrayOverlaps, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Ctx } from "../context";
import { tsParam } from "../sql";

async function mapConcurrent<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  });
  await Promise.all(workers);
}

function displayName(c: GhlContact): string | null {
  const full = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return full || c.contactName || null;
}

/**
 * Guarda la foto actual de un contacto. Si ya teníamos una foto anterior, las
 * diferencias de etiquetas se registran en el historial con sus cotas de tiempo
 * (GHL no informa cuándo se aplicó cada etiqueta).
 */
export async function saveContactSnapshot(ctx: Ctx, contact: GhlContact, observedAt = new Date()) {
  const tags = [...new Set((contact.tags ?? []).map(normalizeTag))].sort();
  await ctx.db.transaction(async (tx) => {
    const [prev] = await tx
      .select({ tags: contactsCache.tags, syncedAt: contactsCache.syncedAt })
      .from(contactsCache)
      .where(and(eq(contactsCache.locationId, ctx.locationId), eq(contactsCache.contactId, contact.id)))
      .for("update");

    if (prev) {
      const before = new Set(prev.tags);
      const after = new Set(tags);
      const added = tags.filter((t) => !before.has(t));
      const removed = prev.tags.filter((t) => !after.has(t));
      if (added.length) {
        await tx.insert(contactTagHistory).values(
          added.map((tag) => ({
            locationId: ctx.locationId,
            contactId: contact.id,
            tagNameNormalized: tag,
            addedAt: observedAt,
            addedAfter: prev.syncedAt,
            source: "snapshot" as const,
          })),
        );
      }
      for (const tag of removed) {
        const updated = await tx
          .update(contactTagHistory)
          .set({ removedAt: observedAt, removedAfter: prev.syncedAt })
          .where(
            and(
              eq(contactTagHistory.locationId, ctx.locationId),
              eq(contactTagHistory.contactId, contact.id),
              eq(contactTagHistory.tagNameNormalized, tag),
              isNull(contactTagHistory.removedAt),
            ),
          )
          .returning({ id: contactTagHistory.id });
        if (!updated.length) {
          await tx.insert(contactTagHistory).values({
            locationId: ctx.locationId,
            contactId: contact.id,
            tagNameNormalized: tag,
            removedAt: observedAt,
            removedAfter: prev.syncedAt,
            source: "snapshot",
          });
        }
      }
    }

    const values = {
      locationId: ctx.locationId,
      contactId: contact.id,
      name: displayName(contact),
      phoneE164: normalizePhone(contact.phone),
      tags,
      ghlDateAdded: contact.dateAdded ? new Date(contact.dateAdded) : null,
      ghlDateUpdated: contact.dateUpdated ? new Date(contact.dateUpdated) : null,
      syncedAt: observedAt,
    };
    await tx
      .insert(contactsCache)
      .values(values)
      .onConflictDoUpdate({ target: [contactsCache.locationId, contactsCache.contactId], set: values });
  });
}

/** Descarga los contactos de los cobros del rango que aún no están en caché. */
export async function syncMissingContacts(ctx: Ctx, from: Date, to: Date) {
  const rows = await ctx.db.execute<{ contact_id: string }>(sql`
    SELECT DISTINCT mc.contact_id
      FROM analytics.message_charges mc
      LEFT JOIN analytics.contacts_cache cc ON cc.location_id = mc.location_id AND cc.contact_id = mc.contact_id
     WHERE mc.location_id = ${ctx.locationId}
       AND mc.settled_at >= ${tsParam(from)} AND mc.settled_at < ${tsParam(to)}
       AND mc.contact_id IS NOT NULL
       AND cc.contact_id IS NULL`);
  let saved = 0;
  let missing = 0;
  // Hasta 8 solicitudes en paralelo; el limitador del cliente mantiene el tope de GHL.
  await mapConcurrent(
    rows.map((r) => r.contact_id),
    8,
    async (id) => {
      const contact = await ctx.ghl.getContact(id);
      if (!contact) {
        missing++;
        return;
      }
      await saveContactSnapshot(ctx, contact);
      saved++;
    },
  );
  return { contactosNuevos: saved, contactosNoEncontrados: missing };
}

/** Refresca todos los contactos que tienen alguna de estas etiquetas (foto completa de sus tags). */
export async function syncContactsWithTags(ctx: Ctx, tagNames: string[]) {
  let total = 0;
  const seen = new Set<string>();
  for (const tag of tagNames) {
    for await (const page of ctx.ghl.contactsWithTag(tag)) {
      const observedAt = new Date();
      for (const c of page) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        await saveContactSnapshot(ctx, c, observedAt);
        total++;
      }
    }
  }
  // Contactos que en caché tienen la etiqueta pero GHL ya no los devuelve: se refrescan uno a uno.
  const stale = tagNames.length
    ? await ctx.db
        .select({ contactId: contactsCache.contactId })
        .from(contactsCache)
        .where(and(eq(contactsCache.locationId, ctx.locationId), arrayOverlaps(contactsCache.tags, tagNames.map(normalizeTag))))
    : [];
  let refreshed = 0;
  for (const { contactId } of stale) {
    if (seen.has(contactId)) continue;
    const c = await ctx.ghl.getContact(contactId);
    if (c) {
      await saveContactSnapshot(ctx, c);
      refreshed++;
    }
  }
  return { contactosConEtiqueta: total, contactosQuePerdieronEtiqueta: refreshed };
}

export async function contactsCountByIds(ctx: Ctx, ids: string[]) {
  if (!ids.length) return 0;
  const [row] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(contactsCache)
    .where(and(eq(contactsCache.locationId, ctx.locationId), inArray(contactsCache.contactId, ids)));
  return row?.n ?? 0;
}
