"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { initialActionState, type ActionState } from "@/lib/action-state";

export interface TagOption {
  name: string;
  contactsCount: number | null;
  takenBy: string | null;
}

interface Props {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  tagOptions: TagOption[];
  defaults: { eventId?: string; name: string; tags: string[]; startDay: string; endDay: string; budgetUsd: string; notes: string };
  maxDays: number;
  submitLabel: string;
}

export function EventForm({ action, tagOptions, defaults, maxDays, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(defaults.tags));
  const v = { ...defaults, ...state.values };
  const visible = tagOptions.filter((t) => selected.has(t.name) || t.name.includes(filter.trim().toLowerCase()));

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {defaults.eventId ? <input type="hidden" name="eventId" value={defaults.eventId} /> : null}
      {state.message ? <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="name">Nombre comercial</Label>
          <Input id="name" name="name" defaultValue={v.name} placeholder="Ej. Mentores 100k – octubre" required />
          <FieldError errors={state.fieldErrors?.name} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startDay">Fecha de inicio (hora de Lima)</Label>
          <Input id="startDay" name="startDay" type="date" defaultValue={v.startDay} required />
          <FieldError errors={state.fieldErrors?.startDay} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endDay">Fecha de fin, inclusive (máx. {maxDays} días)</Label>
          <Input id="endDay" name="endDay" type="date" defaultValue={v.endDay} required />
          <FieldError errors={state.fieldErrors?.endDay} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="budgetUsd">Presupuesto estimado en USD (opcional)</Label>
          <Input id="budgetUsd" name="budgetUsd" inputMode="decimal" defaultValue={v.budgetUsd} placeholder="150.00" />
          <FieldError errors={state.fieldErrors?.budgetUsd} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Input id="notes" name="notes" defaultValue={v.notes} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Etiquetas del evento ({selected.size})</legend>
        <p className="text-xs text-muted-foreground">Puedes agrupar varias etiquetas en un mismo evento. Una etiqueta solo puede pertenecer a un evento.</p>
        <Input placeholder="Buscar etiqueta…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Buscar etiqueta" />
        <div className="max-h-64 overflow-y-auto rounded-md border">
          {visible.map((t) => (
            <label key={t.name} className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 has-[:disabled]:opacity-50">
              <input
                type="checkbox"
                name="tags"
                value={t.name}
                checked={selected.has(t.name)}
                disabled={!!t.takenBy}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(t.name);
                  else next.delete(t.name);
                  setSelected(next);
                }}
              />
              <span className="font-mono">{t.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {t.takenBy ? `En "${t.takenBy}"` : t.contactsCount !== null ? `${t.contactsCount.toLocaleString("es-PE")} contactos` : ""}
              </span>
            </label>
          ))}
          {visible.length === 0 ? <p className="px-3 py-4 text-sm text-muted-foreground">Sin resultados.</p> : null}
        </div>
        <FieldError errors={state.fieldErrors?.tags} />
      </fieldset>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
