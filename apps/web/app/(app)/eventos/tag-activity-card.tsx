import { formatUsd } from "@ett/core";
import Link from "next/link";
import { TimeChart } from "@/components/charts/time-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDay } from "@/lib/dates";
import { FILTER_CATEGORIES } from "@/lib/filters";
import type { TagActivity } from "@/lib/tag-activity";

/** Actividad de los contactos con la etiqueta y rango sugerido (enlace que precarga las fechas). */
export function TagActivityCard({ activity, applyHref, current }: { activity: TagActivity; applyHref: (from: string, to: string) => string; current?: { from: string; to: string } }) {
  const s = activity.sugerido;
  const yaAplicado = s && current && s.from === current.from && s.to === current.to;
  return (
    <Card>
      <CardHeader>
        <CardTitle>¿Cuándo estuvo activo?</CardTitle>
        <CardDescription>
          Gasto diario de los contactos con esta etiqueta entre {formatDay(activity.from)} y {formatDay(activity.to)}: {formatUsd(activity.totalUsd)} de{" "}
          {activity.contactos.toLocaleString("es-PE")} contactos. Incluye conversaciones de esos contactos aunque no sean del evento; usa el gráfico para
          elegir el rango.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {s ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span>
              Rango sugerido (bloque de envíos de campaña alrededor de la fecha, sin los extremos sueltos): <strong>{formatDay(s.from)}</strong> – <strong>{formatDay(s.to)}</strong>
            </span>
            {yaAplicado ? (
              <span className="text-xs text-muted-foreground">Ya está aplicado en el formulario.</span>
            ) : (
              <Link href={applyHref(s.from, s.to)} scroll={false} className="text-sm font-medium text-primary hover:underline">
                Usar este rango
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No hay mensajes facturados de contactos con esta etiqueta en ese periodo.</p>
        )}
        <TimeChart data={activity.series} keys={FILTER_CATEGORIES} />
      </CardContent>
    </Card>
  );
}
