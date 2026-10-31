import { formatUnitUsd, formatUsd, parseEventTag } from "@ett/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatDay, windowDays } from "@/lib/dates";
import { listEventSummaries } from "@/lib/events";
import { getLocation } from "@/lib/location";
import { getTagOptions } from "@/lib/tag-options";

export const metadata: Metadata = { title: "Etiquetas de evento" };

const n = (v: number) => v.toLocaleString("es-PE");

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission("dashboard.ver");
  const location = await getLocation();
  if (!location) {
    return <p className="text-sm text-muted-foreground">La subcuenta aún no se ha sincronizado. Inicia el worker para cargar el catálogo de etiquetas.</p>;
  }
  const canEdit = can(user.role, "eventos.editar");
  const { q = "" } = await searchParams;
  const [summaries, tagOptions] = await Promise.all([listEventSummaries(location.id), getTagOptions(location.id)]);
  const query = q.trim().toLowerCase();
  // Primero las etiquetas con fecha (más recientes arriba), luego el resto en orden alfabético.
  const filtered = tagOptions
    .filter((t) => !query || t.name.includes(query))
    .map((t) => ({ ...t, startDay: parseEventTag(t.name)?.startDay ?? null }))
    .sort((a, b) => (b.startDay ?? "").localeCompare(a.startDay ?? "") || a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Etiquetas de evento</h1>
        <p className="text-sm text-muted-foreground">
          Marca una etiqueta existente de GoHighLevel como evento para calcular el gasto de WhatsApp de sus contactos durante las fechas del evento.
          Lo que no corresponde a ningún evento se cuenta como «Orgánico / Sin campaña».
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Eventos ({summaries.length})</CardTitle>
            {can(user.role, "datos.exportar") && summaries.length ? (
              <a href="/api/export/eventos" className="text-sm font-medium text-primary hover:underline">
                Exportar resumen (CSV)
              </a>
            ) : null}
          </div>
          <CardDescription>Montos en USD. Cantidades = mensajes facturados por categoría.</CardDescription>
        </CardHeader>
        <CardContent>
          {summaries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay etiquetas marcadas como evento.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Evento</Th>
                  <Th>Periodo</Th>
                  <Th>Números</Th>
                  <Th className="text-right">Contactos etiqueta / con gasto</Th>
                  <Th className="text-right">Conversaciones</Th>
                  <Th className="text-right">Marketing</Th>
                  <Th className="text-right">Utilidad</Th>
                  <Th className="text-right">Servicio</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Costo por contacto</Th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((e) => {
                  const w = windowDays(e.startsAt, e.endsAt);
                  return (
                    <tr key={e.id}>
                      <Td>
                        <Link href={`/eventos/${e.id}`} className="font-medium hover:underline">
                          {e.name}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">{e.tags.join(", ")}</div>
                        {!e.lastCalculatedAt ? <Badge tone="info">Calculando…</Badge> : null}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {formatDay(w.from)} – {formatDay(w.to)}
                      </Td>
                      <Td className="whitespace-nowrap font-mono text-xs">{e.numeros.join(", ") || "—"}</Td>
                      <Td className="text-right tabular-nums">
                        {n(e.contactosEtiqueta)} / {n(e.contactosConGasto)}
                      </Td>
                      <Td className="text-right tabular-nums">{n(e.conversaciones)}</Td>
                      <Td className="text-right tabular-nums whitespace-nowrap">
                        {n(e.marketingN)} · {formatUsd(e.marketingUsd)}
                      </Td>
                      <Td className="text-right tabular-nums whitespace-nowrap">
                        {n(e.utilityN)} · {formatUsd(e.utilityUsd)}
                      </Td>
                      <Td className="text-right tabular-nums whitespace-nowrap">
                        {n(e.serviceN)} · {formatUsd(e.serviceUsd)}
                      </Td>
                      <Td className="text-right font-semibold tabular-nums">{formatUsd(e.totalUsd)}</Td>
                      <Td className="text-right tabular-nums">
                        {e.contactosConGasto ? formatUnitUsd(Number(e.totalUsd) / e.contactosConGasto) : "—"}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Etiquetas de la subcuenta ({tagOptions.length})</CardTitle>
          <CardDescription>Catálogo sincronizado desde GoHighLevel. La fecha se detecta del final de la etiqueta (dd.mm.aa).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form className="max-w-sm">
            <Input name="q" defaultValue={q} placeholder="Buscar etiqueta…" aria-label="Buscar etiqueta" />
          </form>
          <Table>
            <thead>
              <tr>
                <Th>Etiqueta</Th>
                <Th>Fecha detectada</Th>
                <Th className="text-right">Contactos</Th>
                <Th>Estado</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                return (
                  <tr key={t.name}>
                    <Td className="font-mono text-xs">{t.name}</Td>
                    <Td className="whitespace-nowrap">{t.startDay ? formatDay(t.startDay) : "—"}</Td>
                    <Td className="text-right tabular-nums">{t.contactsCount !== null ? n(t.contactsCount) : "—"}</Td>
                    <Td>{t.takenBy ? <Badge tone="success">Evento: {t.takenBy}</Badge> : <Badge>Sin marcar</Badge>}</Td>
                    <Td className="text-right">
                      {canEdit && !t.takenBy ? (
                        <Link href={`/eventos/nuevo?tag=${encodeURIComponent(t.name)}`} className="text-sm font-medium text-primary hover:underline">
                          Marcar como evento
                        </Link>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
