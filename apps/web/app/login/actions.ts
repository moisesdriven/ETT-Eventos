"use server";

import { verifyAgainstDummy, verifyPassword } from "@ett/core/password";
import { users } from "@ett/db";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { isLoginBlocked, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/request";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ingresa un correo válido").max(254),
  password: z.string().min(1, "Ingresa tu contraseña").max(200),
  next: z.string().optional(),
});

/** Solo rutas internas, para evitar redirecciones abiertas. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

const INVALID = "Correo o contraseña incorrectos.";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  const values = { email: String(formData.get("email") ?? "").slice(0, 254) };
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const { email, password, next } = parsed.data;
  const ip = await getClientIp();

  if (await isLoginBlocked(email, ip)) {
    return { message: "Demasiados intentos fallidos. Intenta nuevamente en 15 minutos.", values };
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, active: users.active })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);

  const valid = user && user.active ? await verifyPassword(user.passwordHash, password) : await verifyAgainstDummy(password);
  await recordLoginAttempt(email, ip, valid);

  if (!valid || !user) {
    await audit({ userId: user?.id ?? null, action: "sesion.fallida", metadata: { email } });
    return { message: INVALID, values };
  }

  await createSession(user.id);
  await db.update(users).set({ lastLoginAt: sql`now()` }).where(eq(users.id, user.id));
  await audit({ userId: user.id, action: "sesion.inicio" });
  redirect(safeNext(next));
}

export async function logoutAction() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit({ userId: user.id, action: "sesion.cierre" });
  redirect("/login");
}
