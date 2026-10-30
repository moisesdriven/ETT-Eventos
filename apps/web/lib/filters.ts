import { DATE_PRESETS, diffDays, isIsoDay, monthBounds, resolveDatePreset, toLimaDay, type DatePreset, type IsoDay } from "@ett/core";

export const FILTER_CATEGORIES = ["marketing", "utility", "service"] as const;
export type FilterCategory = (typeof FILTER_CATEGORIES)[number];

export interface Filters {
  from: IsoDay;
  to: IsoDay;
  preset: DatePreset | null;
  month: string | null;
  phoneId: number | null;
  categories: FilterCategory[];
  /** uuid del evento, "organico" o null (todos). */
  event: string | null;
  granularity: "dia" | "mes";
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/**
 * Lee los filtros globales desde la URL. Prioridad del periodo:
 * rango libre (desde/hasta) > mes (AAAA-MM) > preset (por defecto «este mes»).
 */
export function parseFilters(sp: RawSearchParams, now = new Date()): Filters {
  let from: IsoDay | undefined;
  let to: IsoDay | undefined;
  let preset: DatePreset | null = null;
  let month: string | null = null;

  const desde = first(sp.desde);
  const hasta = first(sp.hasta);
  const mes = first(sp.mes);
  const p = first(sp.periodo);

  if (desde && hasta && isIsoDay(desde) && isIsoDay(hasta) && diffDays(desde, hasta) >= 0 && diffDays(desde, hasta) <= 731) {
    from = desde;
    to = hasta;
  } else if (mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    const [y, m] = mes.split("-").map(Number) as [number, number];
    ({ from, to } = monthBounds(y, m));
    month = mes;
  } else {
    preset = (DATE_PRESETS as readonly string[]).includes(p ?? "") ? (p as DatePreset) : "este-mes";
    ({ from, to } = resolveDatePreset(preset, now));
  }
  // Nunca más allá de hoy.
  const today = toLimaDay(now);
  if (diffDays(to, today) < 0) to = today;
  if (diffDays(from, to) < 0) from = to;

  const phone = Number(first(sp.numero));
  const cats = all(sp.cat).filter((c): c is FilterCategory => (FILTER_CATEGORIES as readonly string[]).includes(c));
  const ev = first(sp.evento);
  const vista = first(sp.vista);

  return {
    from,
    to,
    preset,
    month,
    phoneId: Number.isInteger(phone) && phone > 0 ? phone : null,
    categories: cats.length ? [...new Set(cats)] : [...FILTER_CATEGORIES],
    event: ev === "organico" || (ev && /^[0-9a-f-]{36}$/i.test(ev)) ? ev : null,
    granularity: vista === "dia" || vista === "mes" ? vista : diffDays(from, to) > 92 ? "mes" : "dia",
  };
}

/** Serializa los filtros a query string (para enlaces y exportaciones). */
export function filtersToQuery(f: Filters): string {
  const q = new URLSearchParams();
  if (f.preset) q.set("periodo", f.preset);
  else if (f.month) q.set("mes", f.month);
  else {
    q.set("desde", f.from);
    q.set("hasta", f.to);
  }
  if (f.phoneId) q.set("numero", String(f.phoneId));
  if (f.categories.length !== FILTER_CATEGORIES.length) for (const c of f.categories) q.append("cat", c);
  if (f.event) q.set("evento", f.event);
  q.set("vista", f.granularity);
  return q.toString();
}
