import { PASSWORD_MIN_LENGTH, hashPassword } from "@ett/core/password";
import { eq, sql } from "drizzle-orm";
import { auditLogs, createDb, users } from "../index";

/** Crea (o reactiva y promueve) el primer administrador desde variables de entorno. */
const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
if (!DATABASE_URL) throw new Error("Falta DATABASE_URL");
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("Define ADMIN_EMAIL y ADMIN_PASSWORD");
if (ADMIN_PASSWORD.length < PASSWORD_MIN_LENGTH) throw new Error(`La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`);

const db = createDb(DATABASE_URL, { max: 1 });
const email = ADMIN_EMAIL.trim().toLowerCase();
const passwordHash = await hashPassword(ADMIN_PASSWORD);

const [existing] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
const [user] = existing
  ? await db
      .update(users)
      .set({ passwordHash, role: "admin", active: true, passwordChangedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(users.id, existing.id))
      .returning({ id: users.id })
  : await db
      .insert(users)
      .values({ email, name: ADMIN_NAME?.trim() || "Administrador", passwordHash, role: "admin" })
      .returning({ id: users.id });

await db.insert(auditLogs).values({ userId: user?.id, action: "usuario.admin_cli", entity: "user", entityId: user?.id });
console.log(`Administrador listo: ${email}`);
await db.$client.end();
