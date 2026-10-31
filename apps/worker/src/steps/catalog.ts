import { normalizeTag } from "@ett/core";
import { eventTags, events, tags } from "@ett/db";
import { and, eq, notInArray } from "drizzle-orm";
import type { Ctx } from "../context";
import { syncContactsWithTags } from "./contacts";

/** Sincroniza el catálogo de etiquetas de la subcuenta con su cantidad de contactos. */
export async function syncTagCatalog(ctx: Ctx, withCounts = true) {
  const list = await ctx.ghl.listTags();
  for (const t of list) {
    const contactsCount = withCounts ? await ctx.ghl.countContactsWithTag(t.name) : undefined;
    const values = {
      locationId: ctx.locationId,
      ghlTagId: t.id,
      name: t.name,
      nameNormalized: normalizeTag(t.name),
      existsInGhl: true,
      syncedAt: new Date(),
      ...(contactsCount !== undefined ? { contactsCount } : {}),
    };
    await ctx.db
      .insert(tags)
      .values(values)
      .onConflictDoUpdate({ target: [tags.locationId, tags.nameNormalized], set: values });
  }
  if (list.length) {
    await ctx.db
      .update(tags)
      .set({ existsInGhl: false })
      .where(and(eq(tags.locationId, ctx.locationId), notInArray(tags.ghlTagId, list.map((t) => t.id))));
  }
  return { etiquetas: list.length };
}

/** Etiquetas que pertenecen a eventos activos (las únicas que importan para la atribución). */
export async function activeEventTagNames(ctx: Ctx): Promise<string[]> {
  const rows = await ctx.db
    .selectDistinct({ tag: eventTags.tagNameNormalized })
    .from(eventTags)
    .innerJoin(events, eq(events.id, eventTags.eventId))
    .where(and(eq(events.locationId, ctx.locationId), eq(events.status, "activo")));
  return rows.map((r) => r.tag);
}

export async function syncCatalog(ctx: Ctx) {
  const catalog = await syncTagCatalog(ctx);
  const eventTagNames = await activeEventTagNames(ctx);
  const contacts = await syncContactsWithTags(ctx, eventTagNames);
  return { ...catalog, etiquetasDeEvento: eventTagNames.length, ...contacts };
}
