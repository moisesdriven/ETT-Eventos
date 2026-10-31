import { sql } from "drizzle-orm";
import { bigserial, boolean, index, inet, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** Esquema de seguridad de la aplicación (usuarios, sesiones, auditoría). */
export const app = pgSchema("app");

export const USER_ROLES = ["admin", "analista", "lectura"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRole = app.enum("user_role", USER_ROLES);

export const users = app.table(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("lectura"),
    active: boolean("active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)],
);

/** La cookie guarda el token en claro; aquí solo su SHA-256. */
export const sessions = app.table(
  "sessions",
  {
    idHash: text("id_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const loginAttempts = app.table(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").notNull(),
    ip: inet("ip"),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_email_idx").on(sql`lower(${t.email})`, t.createdAt),
    index("login_attempts_ip_idx").on(t.ip, t.createdAt),
  ],
);

export const auditLogs = app.table(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: inet("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_user_idx").on(t.userId)],
);
