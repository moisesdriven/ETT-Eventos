"use server";

import { eventMonthAllocations, events } from "@ett/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getLocation } from "@/lib/location";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Guarda (o restablece al cálculo) el % del gasto del mes asignado a cada evento. */
export async function saveAllocationsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "eventos.editar")) return { message: "No tienes permiso para editar el reparto." };
  const location = await getLocation();
  if (!location) return { message: "La subcuenta aún no se ha sincronizado." };

  const month = String(formData.get("month") ?? "");
  if (!MONTH.test(month)) return { message: "Mes inválido." };
  const modo = z.enum(["guardar", "restablecer"]).catch("guardar").parse(formData.get("modo"));

  if (modo === "restablecer") {
    await db.delete(eventMonthAllocations).where(and(eq(eventMonthAllocations.locationId, location.id), eq(eventMonthAllocations.month, month)));
    await audit({ userId: user.id, action: "reparto.restablecer", entity: "month", entityId: month });
    revalidatePath("/");
    return { ok: true, message: "Se restableció el cálculo automático para este mes." };
  }

  const valores: { eventId: string; pct: number }[] = [];
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("pct_")) continue;
    const eventId = key.slice(4);
    if (!UUID.test(eventId)) continue;
    const texto = String(raw).trim().replace(",", ".");
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(texto)) return { message: "Cada porcentaje debe ser un número entre 0 y 100, con hasta 2 decimales." };
    const pct = Number(texto);
    if (pct < 0 || pct > 100) return { message: "Cada porcentaje debe estar entre 0 y 100." };
    valores.push({ eventId, pct });
  }
  if (!valores.length) return { message: "No hay porcentajes para guardar." };
  const suma = valores.reduce((a, v) => a + v.pct, 0);
  if (suma > 100.005) return { message: `La suma de los eventos es ${suma.toFixed(2)} %: no puede superar el 100 %.` };

  // Solo eventos de esta subcuenta.
  const validos = new Set(
    (
      await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.locationId, location.id), inArray(events.id, valores.map((v) => v.eventId))))
    ).map((e) => e.id),
  );
  const filas = valores.filter((v) => validos.has(v.eventId));
  await db
    .insert(eventMonthAllocations)
    .values(filas.map((v) => ({ eventId: v.eventId, month, locationId: location.id, pct: v.pct.toFixed(4), updatedBy: user.id })))
    .onConflictDoUpdate({
      target: [eventMonthAllocations.eventId, eventMonthAllocations.month],
      set: { pct: sql`excluded.pct`, updatedBy: user.id, updatedAt: sql`now()` },
    });
  await audit({ userId: user.id, action: "reparto.guardar", entity: "month", entityId: month, metadata: { porcentajes: filas } });
  revalidatePath("/");
  return { ok: true, message: `Reparto de ${month} guardado (${suma.toFixed(2)} % en eventos).` };
}
