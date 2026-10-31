"use server";

import { PASSWORD_MIN_LENGTH, hashPassword, verifyPassword } from "@ett/core/password";
import { users } from "@ett/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { getCurrentUser, revokeUserSessions } from "@/lib/auth/session";
import { db } from "@/lib/db";

const schema = z
  .object({
    current: z.string().min(1, "Ingresa tu contraseña actual").max(200),
    password: z.string().min(PASSWORD_MIN_LENGTH, `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`).max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden" })
  .refine((v) => v.password !== v.current, { path: ["password"], message: "Debe ser distinta de la actual" });

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Tu sesión expiró. Vuelve a ingresar." };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id));
  if (!row || !(await verifyPassword(row.passwordHash, parsed.data.current))) {
    return { fieldErrors: { current: ["La contraseña actual no es correcta"] } };
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password), passwordChangedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(users.id, user.id));
  await revokeUserSessions(user.id, true);
  await audit({ userId: user.id, action: "usuario.cambiar_contrasena", entity: "user", entityId: user.id });
  return { ok: true, message: "Contraseña actualizada. Se cerraron tus otras sesiones." };
}
