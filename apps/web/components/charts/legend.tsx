import { SERIES, type SeriesKey } from "./series";

export function CategoryLegend({ visible }: { visible?: readonly SeriesKey[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Leyenda">
      {SERIES.filter((s) => !visible || visible.includes(s.key)).map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}
