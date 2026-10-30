import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  schemaFilter: ["app", "analytics"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://ett:ett@localhost:5432/ett" },
  strict: true,
  verbose: true,
});
