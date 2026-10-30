import "server-only";
import { loginAttempts } from "@ett/db";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";

const WINDOW = sql`now() - interval '15 minutes'`;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

/** true si el correo o la IP superaron el límite de intentos fallidos en 15 minutos. */
export async function isLoginBlocked(email: string, ip: string | null): Promise<boolean> {
  const [byEmail] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(sql`lower(${loginAttempts.email}) = ${email}`, eq(loginAttempts.success, false), gt(loginAttempts.createdAt, WINDOW)));
  if ((byEmail?.n ?? 0) >= MAX_FAILURES_PER_EMAIL) return true;
  if (!ip) return false;
  const [byIp] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, WINDOW)));
  return (byIp?.n ?? 0) >= MAX_FAILURES_PER_IP;
}

export async function recordLoginAttempt(email: string, ip: string | null, success: boolean) {
  await db.insert(loginAttempts).values({ email, ip, success });
}
