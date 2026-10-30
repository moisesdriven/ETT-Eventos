import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL");

const client = postgres(url, { max: 1, onnotice: () => {} });
const migrationsFolder = fileURLToPath(new URL("../../migrations", import.meta.url));

await migrate(drizzle(client), { migrationsFolder, migrationsSchema: "drizzle" });
console.log("Migraciones aplicadas.");
await client.end();
