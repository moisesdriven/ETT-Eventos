import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export type Database = ReturnType<typeof createDb>;

export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 10, prepare: true });
  return drizzle(client, { schema, casing: "snake_case" });
}
