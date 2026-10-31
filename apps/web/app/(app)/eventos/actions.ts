"use server";

import { addDays, diffDays, EVENT_MAX_DAYS, isIsoDay, limaDayStart, normalizeTag } from "@ett/core";
import { enqueueSyncRun, eventTags, events, tags } from "@ett/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getLocation } from "@/lib/location";

const day = z.string().refine(isIsoDay, "Fecha inválida");

const eventSchema = z
  .object({
    name: z.string().trim().min(2, "Ingresa un nombre").max(120),
    tags: z.array(z.string().trim().min(1).max(200)).min(1, "Selecciona al menos una etiqueta").max(20),
    startDay: day,
    endDay: day,
    budgetUsd: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v.replace(",", ".") : undefined))
      .refine((v) => v === undefined || /^\d{1,8}(\.\d{1,2})?$/.test(v), "Monto inválido (ej. 150.00)"),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((v) => diffDays(v.startDay, v.endDay) >= 0, { path: ["endDay"], message: "La fecha de fin debe ser igual o posterior al inicio" })
  .refine((v) => diffDays(v.startDay, v.endDay) + 1 <= EVENT_MAX_DAYS, {
    path: ["endDay"],
    message: `El rango puede tener como máximo ${EVENT_MAX_DAYS} días`,
  });

function readForm(formData: FormData) {
  return {
    name: formData.get("name"),
    tags: formData.getAll("tags").map(String),
    startDay: formData.get("startDay"),
    endDay: formData.get("endDay"),
    budgetUsd: formData.get("budgetUsd") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  };
}

async function requireEditor() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "eventos.editar")) throw new Error("No autorizado");
  const location = await getLocation();
  if (!location) throw new Error("La subcuenta aún no se ha sincronizado");
  return { user, location };
}

/** Las etiquetas deben existir en el catálogo y no pertenecer a otro evento. */
async function validateTags(locationId: string, names: string[], exceptEventId?: string): Promise<string | null> {
  const normalized = [...new Set(names.map(normalizeTag))];
  const known = await db
    .select({ name: tags.nameNormalized })
    .from(tags)
    .where(and(eq(tags.locationId, locationId), inArray(tags.nameNormalized, normalized)));
  if (known.length !== normalized.length) return "Alguna etiqueta ya no existe en el catálogo. Actualiza el catálogo e inténtalo de nuevo.";
  const taken = await db
    .select({ tag: eventTags.tagNameNormalized, name: events.name })
    .from(eventTags)
    .innerJoin(events, eq(events.id, eventTags.eventId))
    .where(
      and(
        eq(eventTags.locationId, locationId),
        inArray(eventTags.tagNameNormalized, normalized),
        exceptEventId ? sql`${eventTags.eventId} <> ${exceptEventId}` : undefined,
      ),
    );
  if (taken.length) return `La etiqueta "${taken[0]!.tag}" ya pertenece al evento "${taken[0]!.name}".`;
  return null;
}

function windowOf(startDay: string, endDay: string) {
  return { startsAt: limaDayStart(startDay), endsAt: limaDayStart(addDays(endDay, 1)) };
}

/** Encola el recálculo del evento sobre la unión de sus ventanas (antigua y nueva). */
async function enqueueEventCalc(eventId: string, locationId: string, userId: string, ranges: { startsAt: Date; endsAt: Date }[]) {
  const from = new Date(Math.min(...ranges.map((r) => r.startsAt.getTime())));
  const to = new Date(Math.max(...ranges.map((r) => r.endsAt.getTime())));
  await enqueueSyncRun(db, { kind: "evento", locationId, rangeFrom: from, rangeTo: to, params: { eventId }, requestedBy: userId });
}

export async function createEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, location } = await requireEditor();
  const raw = readForm(formData);
  const values = { name: String(raw.name ?? ""), startDay: String(raw.startDay ?? ""), endDay: String(raw.endDay ?? ""), budgetUsd: String(raw.budgetUsd ?? ""), notes: String(raw.notes ?? "") };
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const input = parsed.data;
  const tagError = await validateTags(location.id, input.tags);
  if (tagError) return { message: tagError, values };

  const window = windowOf(input.startDay, input.endDay);
  const eventId = await db.transaction(async (tx) => {
    const [ev] = await tx
      .insert(events)
      .values({ locationId: location.id, name: input.name, ...window, budgetUsd: input.budgetUsd ?? null, notes: input.notes || null, createdBy: user.id })
      .returning({ id: events.id });
    await tx.insert(eventTags).values([...new Set(input.tags.map(normalizeTag))].map((t) => ({ eventId: ev!.id, locationId: location.id, tagNameNormalized: t })));
    return ev!.id;
  });
  await enqueueEventCalc(eventId, location.id, user.id, [window]);
  await audit({ userId: user.id, action: "evento.crear", entity: "event", entityId: eventId, metadata: { nombre: input.name, etiquetas: input.tags, ...input } });
  revalidatePath("/eventos");
  redirect(`/eventos/${eventId}?creado=1`);
}

export async function updateEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, location } = await requireEditor();
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const parsed = eventSchema.safeParse(readForm(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const input = parsed.data;
  const tagError = await validateTags(location.id, input.tags, eventId);
  if (tagError) return { message: tagError };

  const [prev] = await db.select().from(events).where(and(eq(events.id, eventId), eq(events.locationId, location.id)));
  if (!prev) return { message: "El evento no existe." };
  const window = windowOf(input.startDay, input.endDay);
  await db.transaction(async (tx) => {
    await tx
      .update(events)
      .set({ name: input.name, ...window, budgetUsd: input.budgetUsd ?? null, notes: input.notes || null, updatedAt: sql`now()` })
      .where(eq(events.id, eventId));
    await tx.delete(eventTags).where(eq(eventTags.eventId, eventId));
    await tx.insert(eventTags).values([...new Set(input.tags.map(normalizeTag))].map((t) => ({ eventId, locationId: location.id, tagNameNormalized: t })));
  });
  await enqueueEventCalc(eventId, location.id, user.id, [window, { startsAt: prev.startsAt, endsAt: prev.endsAt }]);
  await audit({
    userId: user.id,
    action: "evento.actualizar",
    entity: "event",
    entityId: eventId,
    metadata: { antes: { nombre: prev.name, inicio: prev.startsAt, fin: prev.endsAt }, despues: input },
  });
  revalidatePath("/eventos");
  revalidatePath(`/eventos/${eventId}`);
  return { ok: true, message: "Cambios guardados. El gasto se recalcula en unos segundos." };
}

export async function recalculateEventAction(formData: FormData) {
  const { user, location } = await requireEditor();
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const [ev] = await db.select().from(events).where(and(eq(events.id, eventId), eq(events.locationId, location.id)));
  if (!ev) return;
  await enqueueEventCalc(eventId, location.id, user.id, [ev]);
  await audit({ userId: user.id, action: "evento.recalcular", entity: "event", entityId: eventId });
  revalidatePath(`/eventos/${eventId}`);
}

/** Desmarca el evento: se borra con su atribución y el gasto vuelve a "Orgánico / Sin campaña". */
export async function deleteEventAction(formData: FormData) {
  const { user, location } = await requireEditor();
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const [ev] = await db.delete(events).where(and(eq(events.id, eventId), eq(events.locationId, location.id))).returning();
  if (ev) {
    // Los cobros que compartía con otros eventos se reparten de nuevo entre los que quedan.
    await enqueueSyncRun(db, { kind: "evento", locationId: location.id, rangeFrom: ev.startsAt, rangeTo: ev.endsAt, params: { eventId: null }, requestedBy: user.id });
    await audit({ userId: user.id, action: "evento.eliminar", entity: "event", entityId: eventId, metadata: { nombre: ev.name } });
  }
  revalidatePath("/eventos");
  redirect("/eventos");
}
