import { addDays, diffDays, isIsoDay, type IsoDay } from "./time";

/** Duración propuesta al marcar un evento: 14 días desde la fecha de la etiqueta, incluido el seguimiento. */
export const EVENT_DEFAULT_DAYS = 14;
/** Duración máxima que se puede configurar (convocatoria previa + evento + seguimiento). */
export const EVENT_MAX_DAYS = 90;

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
  return { startDay, endDayExclusive: addDays(startDay, EVENT_DEFAULT_DAYS) };
}

/**
 * Rango de actividad sugerido para un evento.
 *
 * 1. Toma como semilla el día con más envíos cerca de la fecha de la etiqueta (±14 días)
 *    o, sin fecha, el de más envíos en todo el periodo.
 * 2. Extiende el bloque hacia atrás y adelante mientras haya actividad; lo corta al
 *    encontrar `gapDays` días seguidos sin envíos. Así no se mezcla con otros eventos
 *    en los que participaron los mismos contactos.
 * 3. Dentro del bloque se queda con los días que concentran el `coverage` (90 %) de los
 *    envíos, para ignorar mensajes sueltos de los extremos.
 *
 * `days` debe venir ordenado y con todos los días del periodo (también los de peso 0).
 */
export function suggestActiveRange(
  days: readonly { day: IsoDay; weight: number }[],
  options: { anchor?: IsoDay | null; gapDays?: number; coverage?: number; maxDays?: number } = {},
): { from: IsoDay; to: IsoDay } | null {
  const { anchor = null, gapDays = 7, coverage = 0.9, maxDays = EVENT_MAX_DAYS } = options;
  const w = days.map((d) => Math.max(0, d.weight));
  if (!w.some((x) => x > 0)) return null;

  // 1. Semilla
  let seed = -1;
  for (let i = 0; i < days.length; i++) {
    if (w[i]! <= 0) continue;
    if (anchor && Math.abs(diffDays(anchor, days[i]!.day)) > 14) continue;
    if (seed < 0 || w[i]! > w[seed]!) seed = i;
  }
  if (seed < 0) seed = w.indexOf(Math.max(...w));

  // 2. Bloque contiguo de actividad
  let left = seed;
  for (let j = seed - 1, zeros = 0; j >= 0 && zeros < gapDays; j--) {
    if (w[j]! > 0) {
      left = j;
      zeros = 0;
    } else zeros++;
  }
  let right = seed;
  for (let j = seed + 1, zeros = 0; j < days.length && zeros < gapDays; j++) {
    if (w[j]! > 0) {
      right = j;
      zeros = 0;
    } else zeros++;
  }

  // 3. Recorte de colas dentro del bloque
  const block = w.slice(left, right + 1);
  const total = block.reduce((a, b) => a + b, 0);
  const tail = (total * (1 - coverage)) / 2;
  let acc = 0;
  let from = left;
  let to = right;
  let foundFrom = false;
  for (let k = 0; k < block.length; k++) {
    const before = acc;
    acc += block[k]!;
    if (!foundFrom && acc > tail) {
      from = left + k;
      foundFrom = true;
    }
    if (acc >= total - tail && before < total - tail) to = left + k;
  }
  const f = days[from]!.day;
  const t = days[to]!.day;
  return diffDays(f, t) + 1 > maxDays ? { from: f, to: addDays(f, maxDays - 1) } : { from: f, to: t };
}

/** Las etiquetas de GHL se comparan sin distinguir mayúsculas ni espacios extremos. */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}
