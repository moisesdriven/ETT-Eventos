import { formatPercent, formatUnitUsd, formatUsd } from "@ett/core";
import { Download } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { HBarChart } from "@/components/charts/hbar-chart";
import { TimeChart } from "@/components/charts/time-chart";
import { FilterBar } from "@/components/filter-bar";
import { Stat } from "@/components/stat";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { getByPhone, getFilterOptions, getKpis, getTimeSeries, getTopEvents, getWalletStatus } from "@/lib/analytics";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatDay } from "@/lib/dates";
import { filtersToQuery, parseFilters, type RawSearchParams } from "@/lib/filters";
import { getLocation } from "@/lib/location";
import { formatDateTimeLima } from "@/lib/utils";

export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("es-PE");
const CATEGORY_LABEL = { marketing: "Marketing", utility: "Utilidad", service: "Servicio" } as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("dashboard.ver");
  const sp = await searchParams;
  const location = await getLocation();
  if (!location) {
    return <Alert>La subcuenta aún no se ha sincronizado. Inicia el worker para cargar datos.</Alert>;
  }
  const f = parseFilters(sp);
  const [kpis, series, phones, events, wallet, options] = await Promise.all([
    getKpis(location.id, f),
    getTimeSeries(location.id, f),
    getByPhone(location.id, f),
    getTopEvents(location.id, f),
    getWalletStatus(location.id),
    getFilterOptions(location.id),
  ]);
  const canExport = can(user.role, "datos.exportar");
  const query = filtersToQuery(f);
  const eventName = f.event === "organico" ? "Orgánico / Sin campaña" : options.events.find((e) => e.id === f.event)?.name;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard de WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            {location.name} · {formatDay(f.from)} – {formatDay(f.to)} (hora de Lima){eventName ? ` · ${eventName}` : ""}
          </p>
        </div>
        {canExport ? (
          <a href={`/api/export/dashboard?${query}`} className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted">
            <Download className="size-4" aria-hidden /> Exportar CSV
          </a>
        ) : null}
      </div>
      {sp.error === "permiso" ? <Alert>No tienes permiso para ver esa sección.</Alert> : null}

      <Suspense>
        <FilterBar key={query} value={f} phones={options.phones} events={options.events} />
      </Suspense>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Gasto total" value={formatUsd(kpis.totalUsd)} hint={`${n(kpis.mensajes)} mensajes facturados`} />
        <Stat label="Contactos únicos" value={n(kpis.contactos)} hint={`Costo por contacto ${kpis.contactos ? formatUnitUsd(kpis.totalUsd / kpis.contactos) : "—"}`} />
        <Stat
          label="Conversaciones únicas"
          value={n(kpis.conversaciones)}
          hint={`Costo por conversación ${kpis.conversaciones ? formatUnitUsd(kpis.totalUsd / kpis.conversaciones) : "—"}`}
        />
        <Stat
          label="Saldo del monedero"
          value={wallet.balanceUsd !== null ? formatUsd(wallet.balanceUsd) : "—"}
          hint={
            wallet.daysLeft !== null
              ? `≈ ${Math.floor(wallet.daysLeft)} días al ritmo de ${formatUsd(wallet.avgDaily7d)}/día (7 días)`
              : wallet.balanceAt
                ? `Al ${formatDateTimeLima(wallet.balanceAt)}`
                : "Sin datos"
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(["marketing", "utility", "service"] as const).map((c, i) => (
          <Card key={c} className="flex items-center gap-3 p-4">
            <span className="h-10 w-1.5 rounded-full" style={{ background: `var(--series-${i + 1})` }} aria-hidden />
            <div className="flex flex-col">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{CATEGORY_LABEL[c]}</span>
              <span className="text-xl font-semibold tabular-nums">{formatUsd(kpis[c].usd)}</span>
              <span className="text-xs text-muted-foreground">
                {formatPercent(kpis.totalUsd ? kpis[c].usd / kpis.totalUsd : 0)} del gasto · {n(kpis[c].n)} mensajes
              </span>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evolución {f.granularity === "mes" ? "mensual" : "diaria"}</CardTitle>
          <CardDescription>Gasto o cantidad de mensajes facturados por categoría.</CardDescription>
        </CardHeader>
        <CardContent>
          <TimeChart data={series} keys={f.categories} />
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Ver tabla</summary>
            <Table className="mt-2">
              <thead>
                <tr>
                  <Th>{f.granularity === "mes" ? "Mes" : "Día"}</Th>
                  {f.categories.map((c) => (
                    <Th key={c} className="text-right">
                      {CATEGORY_LABEL[c]}
                    </Th>
                  ))}
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {series.map((p) => (
                  <tr key={p.bucket}>
                    <Td>{p.bucket.length === 7 ? p.bucket : formatDay(p.bucket)}</Td>
                    {f.categories.map((c) => (
                      <Td key={c} className="text-right tabular-nums">
                        {formatUsd(p[c].usd)} · {n(p[c].n)}
                      </Td>
                    ))}
                    <Td className="text-right font-medium tabular-nums">{formatUsd(f.categories.reduce((a, c) => a + p[c].usd, 0))}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </details>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gasto por número remitente</CardTitle>
            <CardDescription>
              <Link href={`/numeros?${query}`} className="hover:underline">
                Ver análisis por número →
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {phones.length ? (
              <HBarChart data={phones.map((p) => ({ ...p, name: p.label ?? p.phone }))} keys={f.categories} />
            ) : (
              <p className="text-sm text-muted-foreground">Sin datos en el periodo.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top 10 eventos por gasto</CardTitle>
            <CardDescription>
              Orgánico / Sin campaña en el periodo: <strong className="text-foreground">{formatUsd(events.organico.totalUsd)}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {events.top.length ? (
              <HBarChart data={events.top} keys={f.categories} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Ningún evento con gasto en el periodo. <Link href="/eventos" className="text-primary hover:underline">Marca etiquetas como evento</Link>.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
