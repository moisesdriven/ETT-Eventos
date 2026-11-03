import { addDays, formatPercent, formatUnitUsd, formatUsd } from "@ett/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { events } from "@ett/db";
import { and, eq, isNull } from "drizzle-orm";
import { getTopEvents } from "@/lib/analytics";
import { db } from "@/lib/db";
import { FILTER_CATEGORIES, type Filters } from "@/lib/filters";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const n = (v: number) => v.toLocaleString("es-PE");

function shiftMonth(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Grilla de los eventos con gasto en un mes (días de Lima). Cada tarjeta muestra la parte
 * del gasto atribuida al evento dentro del mes y el % del total del mes: eventos + orgánico
 * suman 100 % porque los cobros compartidos se reparten.
 */
export async function MonthGrid({ locationId, mes, q }: { locationId: string; mes: string; q: string }) {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const from = `${mes}-01`;
  const to = addDays(`${shiftMonth(mes, 1)}-01`, -1);
  const f: Filters = { from, to, preset: null, month: mes, phoneId: null, categories: [...FILTER_CATEGORIES], event: null, granularity: "dia" };
  const { top, organico, total } = await getTopEvents(locationId, f, 1000);
  const enCurso = new Set(
    (await db.select({ id: events.id }).from(events).where(and(eq(events.locationId, locationId), isNull(events.endsAt)))).map((e) => e.id),
  );
  const enEventos = total - organico.totalUsd;
  const link = (otro: string) => `/eventos?mes=${otro}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>
              Eventos de {MESES[m - 1]} {y}
            </CardTitle>
            <CardDescription>Gasto de WhatsApp atribuido a cada evento dentro del mes (hora de Lima).</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Link href={link(shiftMonth(mes, -1))} className="rounded-md border bg-card p-2 hover:bg-muted" aria-label="Mes anterior">
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            <form method="get" className="flex items-center gap-2">
              {q ? <input type="hidden" name="q" value={q} /> : null}
              <Input type="month" name="mes" defaultValue={mes} className="h-9 w-40" aria-label="Mes" />
              <button type="submit" className="h-9 rounded-md border bg-card px-3 text-sm hover:bg-muted">
                Ver
              </button>
            </form>
            <Link href={link(shiftMonth(mes, 1))} className="rounded-md border bg-card p-2 hover:bg-muted" aria-label="Mes siguiente">
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs uppercase text-muted-foreground">Gasto total del mes</div>
            <div className="text-xl font-semibold tabular-nums">{formatUsd(total)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs uppercase text-muted-foreground">En eventos ({top.length})</div>
            <div className="text-xl font-semibold tabular-nums">{formatUsd(enEventos)}</div>
            <div className="text-xs text-muted-foreground">{formatPercent(total ? enEventos / total : 0)} del mes</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs uppercase text-muted-foreground">Orgánico / Sin campaña</div>
            <div className="text-xl font-semibold tabular-nums">{formatUsd(organico.totalUsd)}</div>
            <div className="text-xs text-muted-foreground">{formatPercent(total ? organico.totalUsd / total : 0)} del mes</div>
          </div>
        </div>

        {top.some((e) => e.eventId && enCurso.has(e.eventId)) ? (
          <p className="text-xs text-muted-foreground">
            Los eventos «en curso» suman todo el gasto de sus contactos hasta hoy: ponles fecha de fin cuando termine la campaña para no atribuirles
            conversaciones posteriores.
          </p>
        ) : null}

        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún evento tuvo gasto en este mes.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {top.map((e) => (
              <Link key={e.eventId} href={`/eventos/${e.eventId}`} className="group rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium group-hover:underline">
                    {e.name}
                    {e.eventId && enCurso.has(e.eventId) ? (
                      <span className="ml-2 rounded-full bg-sky-500/15 px-2 py-0.5 align-middle text-xs font-normal text-sky-700 dark:text-sky-300">
                        en curso
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {formatPercent(total ? e.totalUsd / total : 0)}
                  </span>
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">{formatUsd(e.totalUsd)}</div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${total ? Math.max(2, (e.totalUsd / total) * 100) : 0}%` }} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  {(
                    [
                      ["Marketing", e.marketing, "var(--series-1)"],
                      ["Utilidad", e.utility, "var(--series-2)"],
                      ["Servicio", e.service, "var(--series-3)"],
                    ] as const
                  ).map(([label, v, color]) => (
                    <div key={label}>
                      <dt className="flex items-center gap-1 text-muted-foreground">
                        <span className="inline-block size-2 rounded-sm" style={{ background: color }} aria-hidden />
                        {label}
                      </dt>
                      <dd className="tabular-nums">{formatUsd(v.usd)}</dd>
                      <dd className="tabular-nums text-muted-foreground">{n(v.n)} msj.</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 text-xs text-muted-foreground">
                  {n(e.contactos)} contactos · {e.contactos ? `${formatUnitUsd(e.totalUsd / e.contactos)} por contacto` : "—"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
