import { addDays, toLimaDay } from "@ett/core";

/** Ventana [startsAt, endsAt) → días de Lima inclusivos. `to` es null si el evento sigue en curso. */
export function windowDays(startsAt: Date, endsAt: Date | null) {
  return { from: toLimaDay(startsAt), to: endsAt ? toLimaDay(new Date(endsAt.getTime() - 1)) : null };
}

/** "08 oct. 2026 – 21 oct. 2026" o "08 oct. 2026 – en curso". */
export function formatWindow(startsAt: Date, endsAt: Date | null): string {
  const w = windowDays(startsAt, endsAt);
  return `${formatDay(w.from)} – ${w.to ? formatDay(w.to) : "en curso"}`;
}

const dayFmt = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

/** "2026-10-08" → "08 oct. 2026" */
export function formatDay(day: string): string {
  return dayFmt.format(new Date(`${day}T00:00:00Z`));
}

export { addDays };
