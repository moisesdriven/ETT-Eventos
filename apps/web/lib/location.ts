import "server-only";
import { locations } from "@ett/db";
import { cache } from "react";
import { db } from "./db";

/** La app trabaja con una sola subcuenta: la que registró el worker al iniciar. */
export const getLocation = cache(async () => {
  const [row] = await db.select().from(locations).limit(1);
  return row ?? null;
});
