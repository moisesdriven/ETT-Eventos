import { formatUnitUsd, formatUsd } from "@ett/core";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HBarChart } from "@/components/charts/hbar-chart";
import { FilterBar } from "@/components/filter-bar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { getByPhone, getFilterOptions, getPhoneBreakdown } from "@/lib/analytics";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatDay } from "@/lib/dates";
import { filtersToQuery, parseFilters, type RawSearchParams } from "@/lib/filters";
import { getLocation } from "@/lib/location";
import { updatePhoneLabelAction } from "./actions";

export const metadata: Metadata = { title: "Números de WhatsApp" };
export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("es-PE");

export default async function PhonesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("dashboard.ver");
  const location = await getLocation();
  if (!location) return <Alert>La subcuenta aún no se ha sincronizado.</Alert>;
  const f = { ...parseFilters(await searchParams), phoneId: null };
  const [phones, breakdown, options] = await Promise.all([getByPhone(location.id, f), getPhoneBreakdown(location.id, f), getFilterOptions(location.id)]);
  const months = [...new Set(breakdown.monthly.map((m) => m.month))].sort();
  const canEdit = can(user.role, "eventos.editar");
  const canExport = can(user.role, "datos.exportar");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Números de WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Comparativo de líneas · {formatDay(f.from)} – {formatDay(f.to)} (hora de Lima)
          </p>
        </div>
        {canExport ? (
          <a href={`/api/export/numeros?${filtersToQuery(f)}`} className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted">
            <Download className="size-4" aria-hidden /> Exportar CSV
          </a>
        ) : null}
      </div>

      <Suspense>
        <FilterBar key={filtersToQuery(f)} value={f} phones={options.phones} events={options.events} showPhone={false} />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Resumen por número</CardTitle>
          <CardDescription>Contactos y conversaciones únicos con mensajes facturados en el periodo.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>Número</Th>
                <Th className="text-right">Marketing</Th>
                <Th className="text-right">Utilidad</Th>
                <Th className="text-right">Servicio</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Contactos</Th>
                <Th className="text-right">Conversaciones</Th>
                <Th className="text-right">Eventos</Th>
                <Th className="text-right">Costo por contacto</Th>
              </tr>
            </thead>
            <tbody>
              {phones.map((p) => (
                <tr key={p.phoneId ?? "sin"}>
                  <Td>
                    <div className="font-mono text-xs">{p.phone}</div>
                    {canEdit && p.phoneId ? (
                      <form action={updatePhoneLabelAction} className="mt-1 flex gap-1">
                        <input type="hidden" name="phoneId" value={p.phoneId} />
                        <Input name="label" defaultValue={p.label ?? ""} placeholder="Nombre de la línea" className="h-7 w-40 text-xs" aria-label="Nombre de la línea" />
                        <Button size="sm" variant="ghost" className="h-7">
                          Guardar
                        </Button>
                      </form>
                    ) : p.label ? (
                      <div className="text-xs text-muted-foreground">{p.label}</div>
                    ) : null}
                  </Td>
                  <Td className="text-right tabular-nums whitespace-nowrap">
                    {n(p.marketing.n)} · {formatUsd(p.marketing.usd)}
                  </Td>
                  <Td className="text-right tabular-nums whitespace-nowrap">
                    {n(p.utility.n)} · {formatUsd(p.utility.usd)}
                  </Td>
                  <Td className="text-right tabular-nums whitespace-nowrap">
                    {n(p.service.n)} · {formatUsd(p.service.usd)}
                  </Td>
                  <Td className="text-right font-semibold tabular-nums">{formatUsd(p.totalUsd)}</Td>
                  <Td className="text-right tabular-nums">{n(p.contactos)}</Td>
                  <Td className="text-right tabular-nums">{n(p.conversaciones)}</Td>
                  <Td className="text-right tabular-nums">{n(p.eventos)}</Td>
                  <Td className="text-right tabular-nums">{p.contactos ? formatUnitUsd(p.totalUsd / p.contactos) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {phones.length ? (
            <div className="mt-6">
              <HBarChart data={phones.map((p) => ({ ...p, name: p.label ?? p.phone }))} keys={f.categories} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gasto mensual por número</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>Número</Th>
                  {months.map((m) => (
                    <Th key={m} className="text-right">
                      {m}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {phones.map((p) => (
                  <tr key={p.phoneId ?? "sin"}>
                    <Td className="font-mono text-xs">{p.label ?? p.phone}</Td>
                    {months.map((m) => {
                      const cell = breakdown.monthly.find((r) => r.phone_id === p.phoneId && r.month === m);
                      return (
                        <Td key={m} className="text-right tabular-nums">
                          {cell ? formatUsd(cell.usd) : "—"}
                          {cell ? <div className="text-xs text-muted-foreground">{n(cell.contactos)} contactos</div> : null}
                        </Td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Eventos por número</CardTitle>
          </CardHeader>
          <CardContent>
            {breakdown.events.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Número</Th>
                    <Th>Evento</Th>
                    <Th className="text-right">Gasto</Th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.events.map((e) => (
                    <tr key={`${e.phone_id}-${e.event_id}`}>
                      <Td className="font-mono text-xs">{phones.find((p) => p.phoneId === e.phone_id)?.phone ?? "—"}</Td>
                      <Td>
                        <Link href={`/eventos/${e.event_id}`} className="hover:underline">
                          {e.name}
                        </Link>
                      </Td>
                      <Td className="text-right tabular-nums">{formatUsd(e.usd)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">Ningún evento con gasto en el periodo.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
