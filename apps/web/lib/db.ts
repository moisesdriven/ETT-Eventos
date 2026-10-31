import "server-only";
import { createDb, type Database } from "@ett/db";
import { getEnv } from "./env";

// Reutiliza la conexión entre recargas en desarrollo.
const globalForDb = globalThis as unknown as { ettDb?: Database };

function getDb(): Database {
  globalForDb.ettDb ??= createDb(getEnv().DATABASE_URL);
  return globalForDb.ettDb;
}

/** Conexión perezosa: se abre en la primera consulta. */
export const db = new Proxy({} as Database, {
  get: (_target, prop) => {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
