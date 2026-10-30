"use server";

import { phoneNumbers } from "@ett/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

const schema = z.object({ phoneId: z.coerce.number().int().positive(), label: z.string().trim().max(60) });

/** Nombre interno de una línea (p. ej. «Ventas», «Soporte»). */
export async function updatePhoneLabelAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "eventos.editar")) throw new Error("No autorizado");
  const { phoneId, label } = schema.parse(Object.fromEntries(formData));
  await db.update(phoneNumbers).set({ label: label || null }).where(eq(phoneNumbers.id, phoneId));
  await audit({ userId: user.id, action: "numero.etiquetar", entity: "phone_number", entityId: String(phoneId), metadata: { label } });
  revalidatePath("/numeros");
}
