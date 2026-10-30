import { sql } from "drizzle-orm";

/** Fecha como parámetro tipado para SQL crudo (postgres-js no serializa Date sin tipo). */
export const tsParam = (d: Date) => sql`${d.toISOString()}::timestamptz`;
