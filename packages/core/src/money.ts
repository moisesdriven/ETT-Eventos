const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const usd4 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

/** Totales: `$1,245.50`. Acepta el string `numeric` que devuelve PostgreSQL. */
export function formatUsd(amount: number | string): string {
  return usd2.format(Number(amount));
}

/** Costos unitarios (por mensaje o contacto): `$0.0452`. */
export function formatUnitUsd(amount: number | string): string {
  return usd4.format(Number(amount));
}

const pct = new Intl.NumberFormat("es-PE", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatPercent(ratio: number): string {
  return pct.format(Number.isFinite(ratio) ? ratio : 0);
}
