import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z.string().url(),
    GHL_AGENCY_TOKEN: z.string().min(10, "Falta GHL_AGENCY_TOKEN"),
    GHL_LOCATION_TOKEN: z.string().min(10, "Falta GHL_LOCATION_TOKEN"),
    GHL_LOCATION_ID: z.string().min(5, "Falta GHL_LOCATION_ID"),
    /** Opcional: si no se define se toma de la subcuenta. */
    GHL_COMPANY_ID: z.string().optional(),
    SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(5).default(15),
    /** Hora de Lima (0-23) para el catálogo y la conciliación diaria. */
    DAILY_JOBS_HOUR_LIMA: z.coerce.number().int().min(0).max(23).default(3),
  })
  .parse(process.env);
