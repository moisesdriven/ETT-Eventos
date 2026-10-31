import { attributeCharge, type AttributionRow, type EventWindow, type TagEvidence } from "@ett/core";
import { chargeAttributions, contactsCache, contactTagHistory, eventTags, events, messageCharges } from "@ett/db";
import { and, eq, gt, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { Ctx } from "../context";
import { tsParam } from "../sql";

/**
 * Recalcula la atribución de todos los cobros del rango contra los eventos activos.
 * Idempotente: borra y vuelve a crear las filas de los cobros del rango.
 */
export async function recalculateAttributions(ctx: Ctx, from: Date, to: Date) {
  const evRows = await ctx.db
    .select({ id: events.id, startsAt: events.startsAt, endsAt: events.endsAt, tag: eventTags.tagNameNormalized })
    .from(events)
    .innerJoin(eventTags, eq(eventTags.eventId, events.id))
    .where(and(eq(events.locationId, ctx.locationId), eq(events.status, "activo"), lt(events.startsAt, to), gt(events.endsAt, from)));

  const byId = new Map<string, EventWindow>();
  for (const r of evRows) {
    const e = byId.get(r.id) ?? { id: r.id, startsAt: r.startsAt, endsAt: r.endsAt, tags: [] };
    e.tags.push(r.tag);
    byId.set(r.id, e);
  }
  const windows = [...byId.values()];

  return ctx.db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM analytics.charge_attributions ca
       USING analytics.message_charges mc
       WHERE ca.charge_id = mc.id
         AND mc.location_id = ${ctx.locationId}
         AND mc.settled_at >= ${tsParam(from)} AND mc.settled_at < ${tsParam(to)}`);
    if (!windows.length) return { eventos: 0, cobrosEvaluados: 0, filasAtribucion: 0 };

    const charges = await tx
      .select({ id: messageCharges.id, settledAt: messageCharges.settledAt, amountUsd: messageCharges.amountUsd, contactId: messageCharges.contactId })
      .from(messageCharges)
      .where(
        and(
          eq(messageCharges.locationId, ctx.locationId),
          gte(messageCharges.settledAt, from),
          lt(messageCharges.settledAt, to),
          isNotNull(messageCharges.contactId),
        ),
      );

    const contactIds = [...new Set(charges.map((c) => c.contactId!))];
    const allTags = [...new Set(windows.flatMap((w) => w.tags))];
    const tagsByContact = new Map<string, Set<string>>();
    const historyByContact = new Map<string, TagEvidence[]>();

    for (let i = 0; i < contactIds.length; i += 5000) {
      const ids = contactIds.slice(i, i + 5000);
      const cached = await tx
        .select({ contactId: contactsCache.contactId, tags: contactsCache.tags })
        .from(contactsCache)
        .where(and(eq(contactsCache.locationId, ctx.locationId), inArray(contactsCache.contactId, ids)));
      for (const c of cached) tagsByContact.set(c.contactId, new Set(c.tags));

      const history = await tx
        .select()
        .from(contactTagHistory)
        .where(
          and(
            eq(contactTagHistory.locationId, ctx.locationId),
            inArray(contactTagHistory.contactId, ids),
            inArray(contactTagHistory.tagNameNormalized, allTags),
          ),
        );
      for (const h of history) {
        const list = historyByContact.get(h.contactId) ?? [];
        list.push({ tag: h.tagNameNormalized, addedAt: h.addedAt, addedAfter: h.addedAfter, removedAt: h.removedAt, removedAfter: h.removedAfter });
        historyByContact.set(h.contactId, list);
      }
    }

    const rows: AttributionRow[] = [];
    const empty = new Set<string>();
    for (const c of charges) {
      rows.push(...attributeCharge(c, windows, tagsByContact.get(c.contactId!) ?? empty, historyByContact.get(c.contactId!) ?? []));
    }
    for (let i = 0; i < rows.length; i += 1000) {
      await tx.insert(chargeAttributions).values(rows.slice(i, i + 1000));
    }
    await tx.update(events).set({ lastCalculatedAt: sql`now()` }).where(inArray(events.id, windows.map((w) => w.id)));
    return { eventos: windows.length, cobrosEvaluados: charges.length, filasAtribucion: rows.length };
  });
}
