/** Orden fijo de categorías → color (nunca se re-asigna al filtrar). */
export const SERIES = [
  { key: "marketing", label: "Marketing", color: "var(--series-1)" },
  { key: "utility", label: "Utilidad", color: "var(--series-2)" },
  { key: "service", label: "Servicio", color: "var(--series-3)" },
] as const;

export type SeriesKey = (typeof SERIES)[number]["key"];
export type CategoryValues = Record<SeriesKey, { n: number; usd: number }>;

const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdAxis = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const int = new Intl.NumberFormat("es-PE");
const intAxis = new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 });

export const fmt = {
  usd: (v: number) => usd2.format(v),
  usdAxis: (v: number) => usdAxis.format(v),
  int: (v: number) => int.format(v),
  intAxis: (v: number) => intAxis.format(v),
};
