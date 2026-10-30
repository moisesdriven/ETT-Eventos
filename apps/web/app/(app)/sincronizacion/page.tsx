import { addDays, toLimaDay } from "@ett/core";
import { SYNC_KIND_LABELS, syncRuns, users, type SyncKind } from "@ett/db";
import { desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDay, windowDays } from "@/lib/dates";
import { getLocation } from "@/lib/location";
import { formatDateTimeLima } from "@/lib/utils";
import { enqueueSimpleAction } from "./actions";
import { RangeForm } from "./range-form";

export const metadata: Metadata = { title: "Sincronización" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "neutral" | "success" | "danger" | "info" }> = {
  en_cola: { label: "En cola", tone: "neutral" },
  en_proceso: { label: "En proceso", tone: "info" },
  ok: { label: "Completado", tone: "success" },
  error: { label: "Error", tone: "danger" },
};

/** Resumen corto de las estadísticas de un trabajo. */
function summarize(stats: Record<string, unknown> | null): string {
  if (!stats) return "";
  const parts: string[] = [];
  const add = (key: string, label: string) => typeof stats[key] === "number" && parts.push(`${(stats[key] as number).toLocaleString("es-PE")} ${label}`);
  add("cobrosWhatsapp", "cobros");
  add("mensajes", "mensajes");
  add("cobrosSinResolver", "sin resolver");
  add("contactosNuevos", "contactos nuevos");
  add("etiquetas", "etiquetas");
  add("contactosConEtiqueta", "contactos con etiqueta de evento");
  add("filasAtribucion", "atribuciones");
  if (typeof stats.diasConDescuadre === "number") parts.push(stats.diasConDescuadre === 0 ? "cuadre exacto" : `${stats.diasConDescuadre} días con descuadre (corregido)`);
  if (typeof stats.tramos === "number") parts.push(`tramo ${stats.tramosCompletados ?? 0}/${stats.tramos}`);
  return parts.join(" · ");
}

export default async function SyncPage() {
  await requirePermission("sincronizacion.gestionar");
  const location = await getLocation();
  const runs = await db
    .select({
      id: syncRuns.id,
      kind: syncRuns.kind,
      status: syncRuns.status,
      rangeFrom: syncRuns.rangeFrom,
      rangeTo: syncRuns.rangeTo,
      createdAt: syncRuns.createdAt,
      startedAt: syncRuns.startedAt,
      finishedAt: syncRuns.finishedAt,
      stats: syncRuns.stats,
      error: syncRuns.error,
      requestedBy: users.name,
    })
    .from(syncRuns)
    .leftJoin(users, eq(users.id, syncRuns.requestedBy))
    .orderBy(desc(syncRuns.id))
    .limit(50);

  const [totals] = await db.execute<{ desde: string | null; hasta: string | null; cobros: number; sin_resolver: number; pendientes: number }>(sql`
    SELECT min(day_lima)::text AS desde, max(day_lima)::text AS hasta, count(*)::int AS cobros,
           count(*) FILTER (WHERE resolution = 'sin_resolver')::int AS sin_resolver,
           count(*) FILTER (WHERE resolution = 'pendiente')::int AS pendientes
      FROM analytics.message_charges`);
  const lastOk = runs.find((r) => r.kind === "incremental" && r.status === "ok");
  const today = toLimaDay(new Date());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Sincronización</h1>
        <p className="text-sm text-muted-foreground">
          Subcuenta: <strong>{location?.name ?? "sin registrar (inicia el worker)"}</strong>. El worker sincroniza cada 15 minutos y concilia con el monedero
          todos los días.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4 text-sm">
          <div className="text-xs uppercase text-muted-foreground">Datos cargados</div>
          <div className="mt-1 font-medium">{totals?.desde ? `${formatDay(totals.desde)} – ${formatDay(totals.hasta!)}` : "Sin datos"}</div>
          <div className="text-muted-foreground">{(totals?.cobros ?? 0).toLocaleString("es-PE")} cobros de WhatsApp</div>
        </Card>
        <Card className="p-4 text-sm">
          <div className="text-xs uppercase text-muted-foreground">Cobros sin cruzar</div>
          <div className="mt-1 font-medium">{(totals?.sin_resolver ?? 0).toLocaleString("es-PE")} sin resolver</div>
          <div className="text-muted-foreground">{(totals?.pendientes ?? 0).toLocaleString("es-PE")} pendientes</div>
        </Card>
        <Card className="p-4 text-sm">
          <div className="text-xs uppercase text-muted-foreground">Última sincronización</div>
          <div className="mt-1 font-medium">{formatDateTimeLima(lastOk?.finishedAt)}</div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Acciones rápidas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <form action={enqueueSimpleAction}>
              <input type="hidden" name="kind" value="incremental" />
              <Button variant="outline" className="w-full">
                Sincronizar ahora (últimas 48 h)
              </Button>
            </form>
            <form action={enqueueSimpleAction}>
              <input type="hidden" name="kind" value="catalogo" />
              <Button variant="outline" className="w-full">
                Actualizar etiquetas y contactos
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Carga histórica</CardTitle>
            <CardDescription>Descarga cobros y mensajes de un rango (GHL guarda 6 meses de transacciones).</CardDescription>
          </CardHeader>
          <CardContent>
            <RangeForm kind="backfill" label="Cargar rango" defaultFrom={addDays(today, -30)} defaultTo={today} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Conciliación</CardTitle>
            <CardDescription>Compara día a día con el monedero de GHL y completa lo que falte.</CardDescription>
          </CardHeader>
          <CardContent>
            <RangeForm kind="conciliacion" label="Conciliar rango" defaultFrom={addDays(today, -7)} defaultTo={addDays(today, -1)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registro de trabajos</CardTitle>
          <CardDescription>Últimos 50, en hora de Lima.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Tipo</Th>
                <Th>Estado</Th>
                <Th>Rango</Th>
                <Th>Creado</Th>
                <Th>Duración</Th>
                <Th>Resultado</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const status = STATUS[r.status] ?? STATUS.en_cola!;
                const range = r.rangeFrom && r.rangeTo ? windowDays(r.rangeFrom, r.rangeTo) : null;
                const secs = r.startedAt && r.finishedAt ? Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000) : null;
                return (
                  <tr key={r.id}>
                    <Td className="tabular-nums">{r.id}</Td>
                    <Td>
                      {SYNC_KIND_LABELS[r.kind as SyncKind] ?? r.kind}
                      {r.requestedBy ? <div className="text-xs text-muted-foreground">por {r.requestedBy}</div> : null}
                    </Td>
                    <Td>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap">{range ? `${formatDay(range.from)} – ${formatDay(range.to)}` : "—"}</Td>
                    <Td className="whitespace-nowrap">{formatDateTimeLima(r.createdAt)}</Td>
                    <Td className="tabular-nums">{secs !== null ? `${secs} s` : "—"}</Td>
                    <Td className="max-w-md text-xs">{r.error ? <span className="text-destructive">{r.error}</span> : summarize(r.stats)}</Td>
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
