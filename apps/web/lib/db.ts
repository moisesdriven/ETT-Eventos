import "server-only";
import { createDb, type Database } from "@ett/db";
import { env } from "./env";

// Reutiliza la conexión entre recargas en desarrollo.
const globalForDb = globalThis as unknown as { ettDb?: Database };

export const db = globalForDb.ettDb ?? createDb(env.DATABASE_URL);
if (!globalForDb.ettDb) globalForDb.ettDb = db;
