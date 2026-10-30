import { CATEGORY_LABELS, EVENT_MAX_DAYS, formatUnitUsd, formatUsd, type ChargeCategory } from "@ett/core";
import { syncRuns } from "@ett/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Stat } from "@/components/stat";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDay, windowDays } from "@/lib/dates";
import { listEventSummaries } from "@/lib/events";
import { getTimeSeries } from "@/lib/analytics";
import { FILTER_CATEGORIES } from "@/lib/filters";
import { TimeChart } from "@/components/charts/time-chart";
import { getLocation } from "@/lib/location";
import { getTagOptions } from "@/lib/tag-options";
import { formatDateTimeLima } from "@/lib/utils";
import { deleteEventAction, recalculateEventAction, updateEventAction } from "../actions";
import { EventForm } from "../event-form";

export const metadata: Metadata = { title: "Detalle de evento" };

const n = (v: number) => v.toLocaleString("es-PE");

export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ creado?: string }> }) {
  const user = await requirePermission("dashboard.ver");
  const location = await getLocation();
  const { id } = await params;
  if (!location || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [event] = await listEventSummaries(location.id, id);
  if (!event) notFound();
  const { creado } = await searchParams;
  const canEdit = can(user.role, "eventos.editar");
  const w = windowDays(event.startsAt, event.endsAt);

  const [lastRun] = await db
    .select({ status: syncRuns.status, error: syncRuns.error, createdAt: syncRuns.createdAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.kind, "evento"), sql`${syncRuns.params}->>'eventId' = ${id}`))
    .orderBy(desc(syncRuns.id))
    .limit(1);

  const byPhone = await db.execute<{ phone: string | null; mensajes: number; contactos: number; total: string }>(sql`
    SELECT p.phone_e164 AS phone, count(*)::int AS mensajes, count(DISTINCT mc.contact_id)::int AS contactos, sum(ca.amount_usd)::text AS total
      FROM analytics.charge_attributions ca
      JOIN analytics.message_charges mc ON mc.id = ca.charge_id
      LEFT JOIN analytics.phone_numbers p ON p.id = mc.sender_phone_id
     WHERE ca.event_id = ${id} AND mc.category IN ('marketing', 'utility', 'service')
     GROUP BY 1 ORDER BY sum(ca.amount_usd) DESC`);

  const daily = await db.execute<{ day: string; mensajes: number; contactos: number; total: string }>(sql`
    SELECT mc.day_lima::text AS day, count(*)::int AS mensajes, count(DISTINCT mc.contact_id)::int AS contactos, sum(ca.amount_usd)::text AS total
      FROM analytics.charge_attributions ca
      JOIN analytics.message_charges mc ON mc.id = ca.charge_id
     WHERE ca.event_id = ${id} AND mc.category IN ('marketing', 'utility', 'service')
     GROUP BY 1 ORDER BY 1`);

  const transactions = await db.execute<{
    settled_at: Date;
    category: ChargeCategory;
    amount: string;
    share: string;
    basis: string;
    contact_id: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    conversation_id: string | null;
    sender: string | null;
  }>(sql`
    SELECT mc.settled_at, mc.category, ca.amount_usd::text AS amount, ca.share::text AS share, ca.basis,
           mc.contact_id, cc.name AS contact_name, cc.phone_e164 AS contact_phone, mc.conversation_id, p.phone_e164 AS sender
      FROM analytics.charge_attributions ca
      JOIN analytics.message_charges mc ON mc.id = ca.charge_id
      LEFT JOIN analytics.contacts_cache cc ON cc.location_id = mc.location_id AND cc.contact_id = mc.contact_id
      LEFT JOIN analytics.phone_numbers p ON p.id = mc.sender_phone_id
     WHERE ca.event_id = ${id} AND mc.amount_usd > 0
     ORDER BY mc.settled_at DESC
     LIMIT 200`);

  const series = await getTimeSeries(location.id, {
    from: w.from,
    to: w.to,
    preset: null,
    month: null,
    phoneId: null,
    categories: [...FILTER_CATEGORIES],
    event: id,
    granularity: "dia",
  });
  const tagOptions = canEdit ? await getTagOptions(location.id, id) : [];
  const billable = event.marketingN + event.utilityN + event.serviceN;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/eventos" className="text-sm text-muted-foreground hover:underline">
            ← Etiquetas de evento
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDay(w.from)} – {formatDay(w.to)} · <span className="font-mono">{event.tags.join(", ")}</span>
          </p>
        </div>
        {canEdit ? (
          <form action={recalculateEventAction}>
            <input type="hidden" name="eventId" value={id} />
            <Button variant="outline" size="sm">
              Recalcular
            </Button>
          </form>
        ) : null}
      </div>

      {creado ? <Alert tone="success">Evento creado. El gasto se calcula en segundo plano; recarga la página en unos momentos.</Alert> : null}
      {lastRun && lastRun.status !== "ok" ? (
        <Alert tone={lastRun.status === "error" ? "error" : "success"}>
          {lastRun.status === "error" ? `El último cálculo falló: ${lastRun.error ?? "error desconocido"}` : "Cálculo en curso…"}
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Gasto total" value={formatUsd(event.totalUsd)} hint={event.budgetUsd ? `Presupuesto ${formatUsd(event.budgetUsd)}` : undefined} />
        <Stat
          label="Costo por contacto"
          value={event.contactosConGasto ? formatUnitUsd(Number(event.totalUsd) / event.contactosConGasto) : "—"}
          hint={`${n(event.contactosConGasto)} contactos con gasto`}
        />
        <Stat label="Contactos con la etiqueta" value={n(event.contactosEtiqueta)} />
        <Stat label="Conversaciones" value={n(event.conversaciones)} hint={`${n(billable)} mensajes facturados`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Marketing" value={formatUsd(event.marketingUsd)} hint={`${n(event.marketingN)} mensajes`} />
        <Stat label="Utilidad" value={formatUsd(event.utilityUsd)} hint={`${n(event.utilityN)} mensajes`} />
        <Stat label="Servicio" value={formatUsd(event.serviceUsd)} hint={`${n(event.serviceN)} mensajes`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gasto por día</CardTitle>
            <CardDescription>Días en hora de Lima, solo la parte atribuida a este evento.</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeChart data={series} keys={FILTER_CATEGORIES} />
            <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Ver tabla con contactos por día</summary>
            <Table className="mt-2">
              <thead>
                <tr>
                  <Th>Día</Th>
                  <Th className="text-right">Mensajes</Th>
                  <Th className="text-right">Contactos</Th>
                  <Th className="text-right">USD</Th>
                </tr>
              </thead>
              <tbody>
                {daily.map((d) => (
                  <tr key={d.day}>
                    <Td>{formatDay(d.day)}</Td>
                    <Td className="text-right tabular-nums">{n(d.mensajes)}</Td>
                    <Td className="text-right tabular-nums">{n(d.contactos)}</Td>
                    <Td className="text-right tabular-nums">{formatUsd(d.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            </details>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Por número de WhatsApp</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>Número</Th>
                  <Th className="text-right">Mensajes</Th>
                  <Th className="text-right">Contactos</Th>
                  <Th className="text-right">USD</Th>
                </tr>
              </thead>
              <tbody>
                {byPhone.map((p) => (
                  <tr key={p.phone ?? "sin"}>
                    <Td className="font-mono text-xs">{p.phone ?? "Sin número"}</Td>
                    <Td className="text-right tabular-nums">{n(p.mensajes)}</Td>
                    <Td className="text-right tabular-nums">{n(p.contactos)}</Td>
                    <Td className="text-right tabular-nums">{formatUsd(p.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Transacciones con costo (últimas 200)</CardTitle>
            {can(user.role, "datos.exportar") ? (
              <a href={`/api/export/eventos/${id}`} className="text-sm font-medium text-primary hover:underline">
                Exportar todas (CSV)
              </a>
            ) : null}
          </div>
          <CardDescription>
            Fecha en hora de Lima. «Ventana»: el contacto tiene hoy la etiqueta y el cobro cayó dentro de las fechas; «Historial»: se confirmó que ya tenía la
            etiqueta en ese momento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Contacto</Th>
                <Th>Conversación</Th>
                <Th>Número remitente</Th>
                <Th>Categoría</Th>
                <Th>Base</Th>
                <Th className="text-right">Costo</Th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap">{formatDateTimeLima(t.settled_at)}</Td>
                  <Td>
                    <div>{t.contact_name ?? "—"}</div>
                    <div className="font-mono text-xs text-muted-foreground">{t.contact_phone ?? t.contact_id}</div>
                  </Td>
                  <Td className="font-mono text-xs">{t.conversation_id ?? "—"}</Td>
                  <Td className="font-mono text-xs">{t.sender ?? "—"}</Td>
                  <Td>{CATEGORY_LABELS[t.category]}</Td>
                  <Td>
                    <Badge tone={t.basis === "historial_etiqueta" ? "success" : "neutral"}>{t.basis === "historial_etiqueta" ? "Historial" : "Ventana"}</Badge>
                    {Number(t.share) < 1 ? <Badge tone="info" className="ml-1">Compartido {Math.round(Number(t.share) * 100)} %</Badge> : null}
                  </Td>
                  <Td className="text-right tabular-nums">{formatUnitUsd(t.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Editar evento</CardTitle>
            <CardDescription>Al guardar se recalcula el gasto con las nuevas fechas o etiquetas.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <EventForm
              action={updateEventAction}
              tagOptions={tagOptions}
              maxDays={EVENT_MAX_DAYS}
              submitLabel="Guardar cambios"
              defaults={{ eventId: id, name: event.name, tags: event.tags, startDay: w.from, endDay: w.to, budgetUsd: event.budgetUsd ? Number(event.budgetUsd).toFixed(2) : "", notes: event.notes ?? "" }}
            />
            <form action={deleteEventAction} className="flex flex-wrap items-center gap-3 border-t pt-4">
              <input type="hidden" name="eventId" value={id} />
              <ConfirmButton variant="destructive" size="sm" message="¿Desmarcar este evento? Su gasto pasará a «Orgánico / Sin campaña».">
                Desmarcar evento
              </ConfirmButton>
              <span className="text-xs text-muted-foreground">Se elimina el evento y su gasto vuelve a «Orgánico / Sin campaña». Las etiquetas en GHL no se tocan.</span>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
