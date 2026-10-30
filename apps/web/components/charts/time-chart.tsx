"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CategoryLegend } from "./legend";
import { SERIES, fmt, type CategoryValues, type SeriesKey } from "./series";
import { CategoryTooltip } from "./tooltip";

export interface TimePoint extends CategoryValues {
  bucket: string;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

function label(bucket: string, long = false) {
  const [y, m, d] = bucket.split("-");
  const month = MONTHS[Number(m) - 1];
  return d ? `${Number(d)} ${month}${long ? ` ${y}` : ""}` : `${month} ${y}`;
}

/** Columnas apiladas por categoría (USD o cantidad), por día o por mes. */
export function TimeChart({ data, keys }: { data: TimePoint[]; keys: readonly SeriesKey[] }) {
  const [measure, setMeasure] = useState<"usd" | "n">("usd");
  const series = SERIES.filter((s) => keys.includes(s.key));
  const rows = data.map((p) => ({ bucket: p.bucket, ...Object.fromEntries(series.map((s) => [s.key, p[s.key][measure]])) }));
  const byBucket = new Map(data.map((p) => [p.bucket, p]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CategoryLegend visible={keys} />
        <div className="inline-flex rounded-md border p-0.5 text-xs" role="group" aria-label="Medida">
          {(["usd", "n"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMeasure(m)}
              aria-pressed={measure === m}
              className={`rounded px-2.5 py-1 ${measure === m ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              {m === "usd" ? "USD" : "Cantidad"}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="bucket"
              tickFormatter={(b: string) => label(b)}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tickLine={false}
              minTickGap={12}
            />
            <YAxis
              tickFormatter={(v: number) => (measure === "usd" ? fmt.usdAxis(v) : fmt.intAxis(v))}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, label: b }) => {
                const point = active && typeof b === "string" ? byBucket.get(b) : undefined;
                return point ? <CategoryTooltip title={label(point.bucket, true)} values={point} keys={keys} /> : null;
              }}
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="total"
                fill={s.color}
                stroke="var(--card)"
                strokeWidth={1}
                maxBarSize={24}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
