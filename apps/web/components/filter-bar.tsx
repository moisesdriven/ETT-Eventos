"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

const STORAGE_KEY = "ett.filtros";

const PRESETS = [
  ["hoy", "Hoy"],
  ["ayer", "Ayer"],
  ["ultimos-7-dias", "Últimos 7 días"],
  ["este-mes", "Este mes"],
  ["mes-pasado", "Mes pasado"],
  ["este-anio", "Este año"],
] as const;

const CATEGORIES = [
  ["marketing", "Marketing"],
  ["utility", "Utilidad"],
  ["service", "Servicio"],
] as const;

export interface FilterBarProps {
  value: { preset: string | null; month: string | null; from: string; to: string; phoneId: number | null; categories: string[]; event: string | null; granularity: string };
  phones: { id: number; phone: string; label: string | null }[];
  events: { id: string; name: string }[];
  showEvent?: boolean;
  showPhone?: boolean;
}

/**
 * Filtros globales. Se envían por GET (la URL es compartible) y se recuerdan en
 * este navegador: al volver sin parámetros se restauran los últimos usados.
 */
export function FilterBar({ value, phones, events, showEvent = true, showPhone = true }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [mode, setMode] = useState<"preset" | "mes" | "rango">(value.preset ? "preset" : value.month ? "mes" : "rango");

  useEffect(() => {
    const qs = params.toString();
    try {
      if (qs) localStorage.setItem(STORAGE_KEY, qs);
      else {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) router.replace(`${pathname}?${saved}`);
      }
    } catch {
      // Sin almacenamiento local (modo privado): los filtros solo viven en la URL.
    }
  }, [params, pathname, router]);

  return (
    <form method="get" action={pathname} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="f-modo" className="text-xs">
          Periodo
        </Label>
        <Select id="f-modo" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="w-32">
          <option value="preset">Rápido</option>
          <option value="mes">Mes y año</option>
          <option value="rango">Rango libre</option>
        </Select>
      </div>
      {mode === "preset" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-periodo" className="text-xs">
            &nbsp;
          </Label>
          <Select id="f-periodo" name="periodo" defaultValue={value.preset ?? "este-mes"} className="w-40" aria-label="Periodo rápido">
            {PRESETS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
      ) : mode === "mes" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-mes" className="text-xs">
            Mes
          </Label>
          <Input id="f-mes" name="mes" type="month" defaultValue={value.month ?? value.from.slice(0, 7)} className="w-40" required />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-desde" className="text-xs">
              Desde
            </Label>
            <Input id="f-desde" name="desde" type="date" defaultValue={value.from} className="w-40" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-hasta" className="text-xs">
              Hasta
            </Label>
            <Input id="f-hasta" name="hasta" type="date" defaultValue={value.to} className="w-40" required />
          </div>
        </>
      )}
      {showPhone ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-numero" className="text-xs">
            Número
          </Label>
          <Select id="f-numero" name="numero" defaultValue={value.phoneId ? String(value.phoneId) : ""} className="w-44">
            <option value="">Todos</option>
            {phones.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label ? `${p.label} (${p.phone})` : p.phone}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {showEvent ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-evento" className="text-xs">
            Evento
          </Label>
          <Select id="f-evento" name="evento" defaultValue={value.event ?? ""} className="w-52">
            <option value="">Todos (total del monedero)</option>
            <option value="organico">Orgánico / Sin campaña</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-medium">Categorías</legend>
        <div className="flex h-9 items-center gap-3 text-sm">
          {CATEGORIES.map(([v, l]) => (
            <label key={v} className="flex items-center gap-1.5">
              <input type="checkbox" name="cat" value={v} defaultChecked={value.categories.includes(v)} />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="f-vista" className="text-xs">
          Vista
        </Label>
        <Select id="f-vista" name="vista" defaultValue={value.granularity} className="w-28">
          <option value="dia">Por día</option>
          <option value="mes">Por mes</option>
        </Select>
      </div>
      <Button type="submit">Aplicar</Button>
    </form>
  );
}
