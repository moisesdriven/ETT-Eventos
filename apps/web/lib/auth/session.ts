import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { sessions, users, type UserRole } from "@ett/db";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../db";
import { isProduction } from "../env";
import { getClientIp, getUserAgent } from "../request";
import { SESSION_COOKIE, SESSION_REFRESH_AFTER_MS, SESSION_TTL_MS } from "./constants";
import { can, type Permission } from "./permissions";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    idHash: hashToken(token),
    userId,
    expiresAt,
    ip: await getClientIp(),
    userAgent: await getUserAgent(),
  });
  await setSessionCookie(token, expiresAt);
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.idHash, hashToken(token)));
  store.delete(SESSION_COOKIE);
}

/** Cierra todas las sesiones de un usuario (cambio de contraseña, desactivación). */
export async function revokeUserSessions(userId: string, exceptCurrent = false) {
  const current = exceptCurrent ? (await cookies()).get(SESSION_COOKIE)?.value : undefined;
  await db
    .delete(sessions)
    .where(
      current
        ? and(eq(sessions.userId, userId), sql`${sessions.idHash} <> ${hashToken(current)}`)
        : eq(sessions.userId, userId),
    );
}

/** Usuario de la sesión actual (una sola consulta por request). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const idHash = hashToken(token);
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.idHash, idHash), gt(sessions.expiresAt, sql`now()`), eq(users.active, true)));
  if (!row) return null;

  // Actualiza la actividad como máximo una vez por hora (sin extender el vencimiento absoluto).
  if (Date.now() - row.lastSeenAt.getTime() > SESSION_REFRESH_AFTER_MS) {
    await db.update(sessions).set({ lastSeenAt: sql`now()` }).where(eq(sessions.idHash, idHash));
  }
  const { lastSeenAt: _ignored, ...user } = row;
  return user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Para páginas: redirige al inicio si el rol no tiene el permiso. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/?error=permiso");
  return user;
}
