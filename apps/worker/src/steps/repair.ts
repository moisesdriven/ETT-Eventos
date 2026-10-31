import { limaDayStart, addDays } from "@ett/core";
import { sql } from "drizzle-orm";
import type { Ctx } from "../context";
import { log } from "../log";
import { tsParam } from "../sql";
import { recalculateAttributions } from "./attribution";
import { syncMissingContacts } from "./contacts";
import { syncMessages } from "./messages";
import { resolveCharges } from "./resolve";

const HOUR = 60 * 60 * 1000;

/**
 * Vuelve a descargar los mensajes de los días que tienen cobros sin cruzar (GHL puede haber
 * respondido vacío la primera vez) y repite el cruce, los contactos y la atribución de esos días.
 */
export async function repairUnresolved(ctx: Ctx, from?: Date | null, to?: Date | null) {
  const rows = await ctx.db.execute<{ day: string; n: number }>(sql`
    SELECT day_lima::text AS day, count(*)::int AS n
      FROM analytics.message_charges
     WHERE location_id = ${ctx.locationId}
       AND resolution <> 'resuelto' AND message_ref IS NOT NULL
       AND settled_at < now() - interval '10 minutes'
       ${from ? sql`AND settled_at >= ${tsParam(from)}` : sql``}
       ${to ? sql`AND settled_at < ${tsParam(to)}` : sql``}
     GROUP BY 1 ORDER BY 1`);

  let antes = 0;
  const diasIncompletos: string[] = [];
  for (const { day, n } of rows) {
    antes += n;
    const a = limaDayStart(day);
    const b = limaDayStart(addDays(day, 1));
    const msgs = await syncMessages(ctx, new Date(a.getTime() - 2 * HOUR), b);
    diasIncompletos.push(...msgs.diasIncompletos);
    await resolveCharges(ctx, a, b);
    await syncMissingContacts(ctx, a, b);
    await recalculateAttributions(ctx, a, b);
    log("info", "Día reparado", { dia: day, cobrosSinCruzar: n });
  }

  const [despues] = await ctx.db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM analytics.message_charges
     WHERE location_id = ${ctx.locationId} AND resolution <> 'resuelto' AND message_ref IS NOT NULL
       AND settled_at < now() - interval '10 minutes'
       ${from ? sql`AND settled_at >= ${tsParam(from)}` : sql``}
       ${to ? sql`AND settled_at < ${tsParam(to)}` : sql``}`);
  return { diasReparados: rows.length, sinCruzarAntes: antes, sinCruzarDespues: despues?.n ?? 0, diasIncompletos: [...new Set(diasIncompletos)] };
}
