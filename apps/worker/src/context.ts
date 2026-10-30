import { createDb, locations, type Database } from "@ett/db";
import { createGhlClient, type GhlClient } from "@ett/ghl";
import { sql } from "drizzle-orm";
import { env } from "./env";
import { log } from "./log";

export interface Ctx {
  db: Database;
  ghl: GhlClient;
  locationId: string;
  companyId: string;
}

export async function createContext(): Promise<Ctx> {
  const db = createDb(env.DATABASE_URL, { max: 4 });
  const ghl = createGhlClient(
    { agencyToken: env.GHL_AGENCY_TOKEN, locationToken: env.GHL_LOCATION_TOKEN, locationId: env.GHL_LOCATION_ID },
    { onRetry: (info) => log("warn", "Reintento GHL", info) },
  );
  const location = await ghl.getLocation();
  const companyId = env.GHL_COMPANY_ID ?? location.companyId;
  if (!companyId) throw new Error("No se pudo determinar el companyId de la agencia; define GHL_COMPANY_ID");

  await db
    .insert(locations)
    .values({ id: location.id, name: location.name, companyId, timezone: location.timezone ?? null })
    .onConflictDoUpdate({
      target: locations.id,
      set: { name: location.name, companyId, timezone: location.timezone ?? null, updatedAt: sql`now()` },
    });
  log("info", "Subcuenta lista", { location: location.name });
  return { db, ghl, locationId: location.id, companyId };
}
