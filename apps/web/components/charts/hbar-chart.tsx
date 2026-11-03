"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CategoryLegend } from "./legend";
import { SERIES, fmt, type CategoryValues, type SeriesKey } from "./series";
import { CategoryTooltip } from "./tooltip";

export interface HBarRow extends CategoryValues {
  name: string;
}

/**
 * Barras horizontales apiladas por categoría (USD): números, eventos.
 * Al final de cada barra muestra su total y, si se pasa `total`, el % que representa.
 */
export function HBarChart({ data, keys, total }: { data: HBarRow[]; keys: readonly SeriesKey[]; total?: number }) {
  const series = SERIES.filter((s) => keys.includes(s.key));
  const rowTotal = (r: HBarRow) => series.reduce((acc, s) => acc + r[s.key].usd, 0);
  const share = (r: HBarRow) => (total && total > 0 ? fmt.pct(rowTotal(r) / total) : null);
  const rows = data.map((r, i) => ({ id: String(i), name: r.name, ...Object.fromEntries(series.map((s) => [s.key, r[s.key].usd])) }));
  const height = Math.max(120, data.length * 40 + 40);

  return (
    <div className="flex flex-col gap-3">
      <CategoryLegend visible={keys} />
      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: total ? 128 : 72, bottom: 0, left: 0 }} barCategoryGap="30%">
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" tickFormatter={fmt.usdAxis} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="id"
              tickFormatter={(id: string) => {
                const name = data[Number(id)]?.name ?? "";
                return name.length > 26 ? `${name.slice(0, 25)}…` : name;
              }}
              tick={{ fontSize: 11, fill: "var(--foreground)" }}
              axisLine={false}
              tickLine={false}
              width={170}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, label }) => {
                const row = active && label !== undefined ? data[Number(label)] : undefined;
                const parte = row ? share(row) : null;
                return row ? <CategoryTooltip title={row.name} values={row} keys={keys} note={parte ? `${parte} del gasto del periodo` : undefined} /> : null;
              }}
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="total"
                fill={s.color}
                stroke="var(--card)"
                strokeWidth={1}
                maxBarSize={24}
                radius={i === series.length - 1 ? [0, 4, 4, 0] : 0}
                isAnimationActive={false}
              >
                {i === series.length - 1 ? (
                  <LabelList
                    dataKey="id"
                    content={(p) => {
                      const row = data[Number(p.index)];
                      if (!row) return null;
                      const x = Number(p.x ?? 0) + Number(p.width ?? 0) + 6;
                      const y = Number(p.y ?? 0) + Number(p.height ?? 0) / 2;
                      const parte = share(row);
                      return (
                        <text x={x} y={y} dominantBaseline="middle" fontSize={11} fill="var(--foreground)">
                          <tspan fontWeight={600}>{fmt.usd(rowTotal(row))}</tspan>
                          {parte ? <tspan fill="var(--muted-foreground)">{` · ${parte}`}</tspan> : null}
                        </text>
                      );
                    }}
                  />
                ) : null}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
