import { diffDays, EVENT_DEFAULT_DAYS, EVENT_MAX_DAYS, isIsoDay, parseEventTag, toLimaDay } from "@ett/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { getLocation } from "@/lib/location";
import { getTagActivity } from "@/lib/tag-activity";
import { getTagOptions } from "@/lib/tag-options";
import { createEventAction } from "../actions";
import { EventForm } from "../event-form";
import { TagActivityCard } from "../tag-activity-card";

export const metadata: Metadata = { title: "Marcar etiqueta como evento" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ tag?: string; desde?: string; hasta?: string }> }) {
  await requirePermission("eventos.editar");
  const location = await getLocation();
  if (!location) return <p className="text-sm text-muted-foreground">La subcuenta aún no se ha sincronizado.</p>;
  const { tag, desde, hasta } = await searchParams;
  const options = await getTagOptions(location.id);
  const preselected = options.find((o) => o.name === tag?.toLowerCase() && !o.takenBy)?.name;
  const parsed = preselected ? parseEventTag(preselected) : null;

  // Fechas: las elegidas con «Usar este rango»; si no, inicio = fecha de la etiqueta y sin fin (en curso).
  const custom = desde && hasta && isIsoDay(desde) && isIsoDay(hasta) && diffDays(desde, hasta) >= 0;
  const startDay = custom ? desde : (parsed?.startDay ?? toLimaDay(new Date()));
  const endDay = custom ? hasta : "";
  const activity = preselected ? await getTagActivity(location.id, [preselected], parsed?.startDay ?? null) : null;
  const base = `/eventos/nuevo?tag=${encodeURIComponent(preselected ?? "")}`;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Link href="/eventos" className="text-sm text-muted-foreground hover:underline">
          ← Etiquetas de evento
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Marcar etiqueta como evento</h1>
        <p className="text-sm text-muted-foreground">
          Al guardar se calcula el gasto de WhatsApp de los contactos con la etiqueta dentro del rango del evento.
        </p>
      </div>

      {activity ? <TagActivityCard activity={activity} applyHref={(f, t) => `${base}&desde=${f}&hasta=${t}`} current={{ from: startDay, to: endDay || null }} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Datos del evento</CardTitle>
          <CardDescription>
            {custom
              ? "Fechas tomadas del rango elegido. Puedes ajustarlas."
              : parsed
                ? `El inicio se tomó de la etiqueta (${preselected}). Deja la fecha de fin vacía si la campaña sigue activa, o usa el rango sugerido si ya terminó (referencia: ${EVENT_DEFAULT_DAYS} días con seguimiento).`
                : `Elige desde cuándo estuvo activo; la fecha de fin es opcional (máximo ${EVENT_MAX_DAYS} días).`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EventForm
            key={`${startDay}-${endDay}`}
            action={createEventAction}
            tagOptions={options}
            maxDays={EVENT_MAX_DAYS}
            submitLabel="Guardar y calcular gasto"
            defaults={{ name: "", tags: preselected ? [preselected] : [], startDay, endDay, budgetUsd: "", notes: "" }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
