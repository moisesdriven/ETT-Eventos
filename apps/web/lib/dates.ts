import { addDays, toLimaDay } from "@ett/core";

/** Ventana [startsAt, endsAt) → días de Lima inclusivos para mostrar. */
export function windowDays(startsAt: Date, endsAt: Date) {
  return { from: toLimaDay(startsAt), to: toLimaDay(new Date(endsAt.getTime() - 1)) };
}

const dayFmt = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

/** "2026-10-08" → "08 oct. 2026" */
export function formatDay(day: string): string {
  return dayFmt.format(new Date(`${day}T00:00:00Z`));
}

export { addDays };
