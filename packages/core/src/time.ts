/**
 * Utilidades de fecha en hora de Lima.
 *
 * Perú usa UTC-5 fijo (sin horario de verano desde 1994), así que un día de Lima
 * va de 05:00:00.000Z a 04:59:59.999Z del día siguiente. Trabajamos con un
 * desfase fijo para que los cortes sean idénticos en la app, el worker y SQL
 * (`AT TIME ZONE 'America/Lima'`).
 */
export const LIMA_TZ = "America/Lima";
const LIMA_OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha calendario en formato YYYY-MM-DD. */
export type IsoDay = string;

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDay(value: string): value is IsoDay {
  const m = ISO_DAY_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

function assertIsoDay(day: string): asserts day is IsoDay {
  if (!isIsoDay(day)) throw new Error(`Fecha inválida (se espera YYYY-MM-DD): ${day}`);
}

/** Día de Lima (YYYY-MM-DD) al que pertenece un instante. */
export function toLimaDay(instant: Date): IsoDay {
  return new Date(instant.getTime() + LIMA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Instante UTC en que empieza (00:00 Lima) un día de Lima. */
export function limaDayStart(day: IsoDay): Date {
  assertIsoDay(day);
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - LIMA_OFFSET_MS);
}

export function addDays(day: IsoDay, days: number): IsoDay {
  assertIsoDay(day);
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Diferencia en días calendario (b - a). */
export function diffDays(a: IsoDay, b: IsoDay): number {
  assertIsoDay(a);
  assertIsoDay(b);
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** Rango semiabierto [start, end) en UTC de un día de Lima. */
export function limaDayRange(day: IsoDay): { start: Date; end: Date } {
  return { start: limaDayStart(day), end: limaDayStart(addDays(day, 1)) };
}

/** Rango de días inclusivo [from, to] → rango UTC semiabierto [start, end). */
export function limaRange(from: IsoDay, to: IsoDay): { start: Date; end: Date } {
  if (diffDays(from, to) < 0) throw new Error(`Rango inválido: ${from} > ${to}`);
  return { start: limaDayStart(from), end: limaDayStart(addDays(to, 1)) };
}

/** Primer y último día de un mes (month 1-12). */
export function monthBounds(year: number, month: number): { from: IsoDay; to: IsoDay } {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error(`Mes inválido: ${month}`);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from, to: `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
}

export const DATE_PRESETS = ["hoy", "ayer", "ultimos-7-dias", "este-mes", "mes-pasado", "este-anio"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  hoy: "Hoy",
  ayer: "Ayer",
  "ultimos-7-dias": "Últimos 7 días",
  "este-mes": "Este mes",
  "mes-pasado": "Mes pasado",
  "este-anio": "Este año",
};

/** Resuelve un preset a días de Lima inclusivos, relativo a `now`. */
export function resolveDatePreset(preset: DatePreset, now: Date = new Date()): { from: IsoDay; to: IsoDay } {
  const today = toLimaDay(now);
  const [y, m] = today.split("-").map(Number) as [number, number];
  switch (preset) {
    case "hoy":
      return { from: today, to: today };
    case "ayer": {
      const d = addDays(today, -1);
      return { from: d, to: d };
    }
    case "ultimos-7-dias":
      return { from: addDays(today, -6), to: today };
    case "este-mes":
      return { from: monthBounds(y, m).from, to: today };
    case "mes-pasado":
      return m === 1 ? monthBounds(y - 1, 12) : monthBounds(y, m - 1);
    case "este-anio":
      return { from: `${y}-01-01`, to: today };
  }
}
