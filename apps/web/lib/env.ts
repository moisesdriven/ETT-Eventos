import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** Clave de la URL de avisos de GHL (webhooks de etiquetas). Vacía = desactivado. */
  WEBHOOK_SECRET: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined)
    .refine((v) => v === undefined || v.length >= 24, "WEBHOOK_SECRET debe tener al menos 24 caracteres"),
});

let cached: z.infer<typeof schema> | undefined;

/** Se valida en el primer uso (no al compilar la imagen, donde no hay variables). */
export function getEnv() {
  cached ??= schema.parse(process.env);
  return cached;
}

export const isProduction = process.env.NODE_ENV === "production";
