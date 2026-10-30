import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
});

let cached: z.infer<typeof schema> | undefined;

/** Se valida en el primer uso (no al compilar la imagen, donde no hay variables). */
export function getEnv() {
  cached ??= schema.parse(process.env);
  return cached;
}

export const isProduction = process.env.NODE_ENV === "production";
