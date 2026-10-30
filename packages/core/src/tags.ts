import { addDays, isIsoDay, type IsoDay } from "./time";

/** Duración máxima de un evento, incluido el seguimiento (regla de negocio). */
export const EVENT_MAX_DAYS = 14;

export interface ParsedEventTag {
  /** Fecha de inicio leída del sufijo `dd.mm.aa`. */
  startDay: IsoDay;
  /** Partes del código separadas por guion, sin la fecha (p. ej. ["men03", "lci"]). */
  codeParts: string[];
}

const TAG_DATE_RE = /(?:^|[-_\s])(\d{2})\.(\d{2})\.(\d{2})\s*$/;

/**
 * Lee la fecha de inicio embebida al final de una etiqueta de evento.
 * Tolera variantes reales vistas en GHL: mayúsculas/minúsculas, programa sin
 * edición (`iatt-ev03-wci-21.02.26`) o formato de 2 letras (`min04-ev01-wp-07.02.26`).
 * Devuelve null si la etiqueta no termina en una fecha válida.
 */
export function parseEventTag(tag: string): ParsedEventTag | null {
  const name = tag.trim().toLowerCase();
  const m = TAG_DATE_RE.exec(name);
  if (!m) return null;
  const [, dd, mm, yy] = m as unknown as [string, string, string, string];
  const startDay = `20${yy}-${mm}-${dd}`;
  if (!isIsoDay(startDay)) return null;
  const code = name.slice(0, m.index).replace(/[-_\s]+$/, "");
  return { startDay, codeParts: code ? code.split(/[-_\s]+/) : [] };
}

/** Ventana por defecto de un evento: [inicio, inicio + 14 días) en días de Lima. */
export function defaultEventWindow(startDay: IsoDay): { startDay: IsoDay; endDayExclusive: IsoDay } {
  return { startDay, endDayExclusive: addDays(startDay, EVENT_MAX_DAYS) };
}

/** Las etiquetas de GHL se comparan sin distinguir mayúsculas ni espacios extremos. */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}
