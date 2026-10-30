import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z.string().url(),
    // trim: tolera espacios o saltos de línea de Windows (CRLF) pegados al valor.
    GHL_AGENCY_TOKEN: z.string().trim().min(10, "Falta GHL_AGENCY_TOKEN"),
    GHL_LOCATION_TOKEN: z.string().trim().min(10, "Falta GHL_LOCATION_TOKEN"),
    GHL_LOCATION_ID: z.string().trim().min(5, "Falta GHL_LOCATION_ID"),
    /** Opcional: si no se define se toma de la subcuenta. */
    GHL_COMPANY_ID: z
      .string()
      .optional()
      .transform((v) => v?.trim() || undefined),
    SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(5).default(15),
    /** Hora de Lima (0-23) para el catálogo y la conciliación diaria. */
    DAILY_JOBS_HOUR_LIMA: z.coerce.number().int().min(0).max(23).default(3),
  })
  .parse(process.env);
