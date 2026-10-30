import { addDays, defaultEventWindow, EVENT_MAX_DAYS, parseEventTag, toLimaDay } from "@ett/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";
import { getLocation } from "@/lib/location";
import { getTagOptions } from "@/lib/tag-options";
import { createEventAction } from "../actions";
import { EventForm } from "../event-form";

export const metadata: Metadata = { title: "Marcar etiqueta como evento" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  await requirePermission("eventos.editar");
  const location = await getLocation();
  if (!location) return <p className="text-sm text-muted-foreground">La subcuenta aún no se ha sincronizado.</p>;
  const { tag } = await searchParams;
  const options = await getTagOptions(location.id);
  const preselected = options.find((o) => o.name === tag?.toLowerCase() && !o.takenBy)?.name;
  const parsed = preselected ? parseEventTag(preselected) : null;
  const startDay = parsed?.startDay ?? toLimaDay(new Date());
  const endDay = addDays(defaultEventWindow(startDay).endDayExclusive, -1);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/eventos" className="text-sm text-muted-foreground hover:underline">
          ← Etiquetas de evento
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Marcar etiqueta como evento</h1>
        <p className="text-sm text-muted-foreground">
          Al guardar se calcula el gasto de WhatsApp de los contactos con la etiqueta dentro de las fechas del evento.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Datos del evento</CardTitle>
          <CardDescription>
            {parsed
              ? `La fecha de inicio se tomó de la etiqueta (${preselected}). Puedes cambiarla.`
              : `Duración por defecto: ${EVENT_MAX_DAYS} días incluido el seguimiento.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EventForm
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
