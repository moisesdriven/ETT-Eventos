"use server";

import { PASSWORD_MIN_LENGTH, hashPassword } from "@ett/core/password";
import { USER_ROLES, users } from "@ett/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser, revokeUserSessions } from "@/lib/auth/session";
import { db } from "@/lib/db";

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(200, "Máximo 200 caracteres");

const createSchema = z.object({
  name: z.string().trim().min(2, "Ingresa el nombre").max(120),
  email: z.string().trim().toLowerCase().email("Correo inválido").max(254),
  role: z.enum(USER_ROLES),
  password,
});

const updateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(USER_ROLES),
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

const resetSchema = z.object({ userId: z.string().uuid(), password });

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "usuarios.gestionar")) throw new Error("No autorizado");
  return user;
}

/** Evita dejar el sistema sin administradores activos. */
async function otherActiveAdmins(exceptUserId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, exceptUserId)));
  return row?.n ?? 0;
}

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  const values = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? ""), role: String(formData.get("role") ?? "") };
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const { name, email, role } = parsed.data;

  const [exists] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
  if (exists) return { fieldErrors: { email: ["Ya existe un usuario con ese correo"] }, values };

  const [created] = await db
    .insert(users)
    .values({ name, email, role, passwordHash: await hashPassword(parsed.data.password) })
    .returning({ id: users.id });
  await audit({ userId: admin.id, action: "usuario.crear", entity: "user", entityId: created?.id, metadata: { email, role } });
  revalidatePath("/admin/usuarios");
  return { ok: true, message: `Usuario ${email} creado.` };
}

export async function updateUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Datos inválidos." };
  const { userId, role, active } = parsed.data;

  if (userId === admin.id && (role !== "admin" || !active)) {
    return { message: "No puedes quitarte el rol de administrador ni desactivarte." };
  }
  const [target] = await db.select({ role: users.role, active: users.active }).from(users).where(eq(users.id, userId));
  if (!target) return { message: "El usuario no existe." };
  if (target.role === "admin" && target.active && (role !== "admin" || !active) && (await otherActiveAdmins(userId)) === 0) {
    return { message: "Debe quedar al menos un administrador activo." };
  }

  await db.update(users).set({ role, active, updatedAt: sql`now()` }).where(eq(users.id, userId));
  if (!active || role !== target.role) await revokeUserSessions(userId);
  await audit({
    userId: admin.id,
    action: "usuario.actualizar",
    entity: "user",
    entityId: userId,
    metadata: { antes: target, despues: { role, active } },
  });
  revalidatePath("/admin/usuarios");
  return { ok: true, message: "Cambios guardados." };
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { userId } = parsed.data;

  const updated = await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password), passwordChangedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (!updated.length) return { message: "El usuario no existe." };
  await revokeUserSessions(userId, userId === admin.id);
  await audit({ userId: admin.id, action: "usuario.restablecer_contrasena", entity: "user", entityId: userId });
  return { ok: true, message: "Contraseña restablecida. Se cerraron las sesiones abiertas del usuario." };
}
