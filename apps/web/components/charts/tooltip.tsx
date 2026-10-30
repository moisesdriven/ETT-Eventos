import { SERIES, fmt, type CategoryValues, type SeriesKey } from "./series";

/** Tooltip con todas las series del punto, el total y la cantidad de mensajes. */
export function CategoryTooltip({ title, values, keys }: { title: string; values: CategoryValues; keys: readonly SeriesKey[] }) {
  const series = SERIES.filter((s) => keys.includes(s.key));
  const total = series.reduce((acc, s) => acc + values[s.key].usd, 0);
  const n = series.reduce((acc, s) => acc + values[s.key].n, 0);
  return (
    <div className="min-w-48 rounded-md border bg-card px-3 py-2 text-xs shadow-md">
      <div className="mb-1.5 font-medium text-foreground">{title}</div>
      {series.map((s) => (
        <div key={s.key} className="flex items-center gap-2 py-0.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          <span className="text-muted-foreground">{s.label}</span>
          <span className="ml-auto tabular-nums text-foreground">
            {fmt.usd(values[s.key].usd)} · {fmt.int(values[s.key].n)}
          </span>
        </div>
      ))}
      <div className="mt-1.5 flex border-t pt-1.5 font-medium text-foreground">
        Total <span className="ml-auto tabular-nums">{fmt.usd(total)} · {fmt.int(n)} msj.</span>
      </div>
    </div>
  );
}
