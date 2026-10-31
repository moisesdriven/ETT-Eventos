"use server";

import { addDays, diffDays, isIsoDay, limaDayStart } from "@ett/core";
import { enqueueSyncRun } from "@ett/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getLocation } from "@/lib/location";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "sincronizacion.gestionar")) throw new Error("No autorizado");
  return { user, location: await getLocation() };
}

const rangeSchema = z
  .object({
    kind: z.enum(["backfill", "conciliacion"]),
    fromDay: z.string().refine(isIsoDay, "Fecha inválida"),
    toDay: z.string().refine(isIsoDay, "Fecha inválida"),
  })
  .refine((v) => diffDays(v.fromDay, v.toDay) >= 0, { path: ["toDay"], message: "La fecha final debe ser igual o posterior a la inicial" })
  .refine((v) => diffDays(v.fromDay, v.toDay) <= 366, { path: ["toDay"], message: "Máximo un año por solicitud" });

export async function enqueueRangeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, location } = await requireAdmin();
  const parsed = rangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { kind, fromDay, toDay } = parsed.data;
  const run = await enqueueSyncRun(db, {
    kind,
    locationId: location?.id ?? null,
    rangeFrom: limaDayStart(fromDay),
    rangeTo: limaDayStart(addDays(toDay, 1)),
    requestedBy: user.id,
  });
  await audit({ userId: user.id, action: `sincronizacion.${kind}`, entity: "sync_run", entityId: String(run.id), metadata: { fromDay, toDay } });
  revalidatePath("/sincronizacion");
  return { ok: true, message: `Trabajo #${run.id} en cola.` };
}

export async function enqueueSimpleAction(formData: FormData) {
  const { user, location } = await requireAdmin();
  const kind = z.enum(["incremental", "catalogo", "reparacion"]).parse(formData.get("kind"));
  const run = await enqueueSyncRun(db, { kind, locationId: location?.id ?? null, requestedBy: user.id, dedupe: true });
  await audit({ userId: user.id, action: `sincronizacion.${kind}`, entity: "sync_run", entityId: String(run.id) });
  revalidatePath("/sincronizacion");
}
