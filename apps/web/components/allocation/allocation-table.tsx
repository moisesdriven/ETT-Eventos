"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveAllocationsAction } from "@/app/(app)/allocation-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { initialActionState } from "@/lib/action-state";

export interface AllocationRow {
  eventId: string;
  name: string;
  /** Gasto atribuido por el sistema en el mes. */
  usd: number;
  /** % calculado (0–100) sobre el total del mes. */
  calcPct: number;
  /** % guardado a mano, o null si se usa el cálculo. */
  savedPct: number | null;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctFmt = (v: number) => `${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const round2 = (v: number) => Math.round(v * 100) / 100;
const parse = (s: string) => {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Reparto del gasto total del mes entre eventos. Cada fila trae el % calculado como
 * ejemplo; el usuario puede escribir otro y el monto se recalcula al instante.
 */
export function AllocationTable({ month, monthLabel, monthTotal, organicUsd, rows, canEdit }: {
  month: string;
  monthLabel: string;
  monthTotal: number;
  organicUsd: number;
  rows: AllocationRow[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(saveAllocationsAction, initialActionState);
  const inicial = useMemo(() => Object.fromEntries(rows.map((r) => [r.eventId, String(round2(r.savedPct ?? r.calcPct))])), [rows]);
  const [valores, setValores] = useState<Record<string, string>>(inicial);
  // Tras guardar o borrar, el servidor manda los valores nuevos: se reflejan sin perder el mensaje.
  useEffect(() => setValores(inicial), [inicial]);
  const hayGuardados = rows.some((r) => r.savedPct !== null);

  const suma = rows.reduce((a, r) => a + (parse(valores[r.eventId] ?? "") || 0), 0);
  const resto = 100 - suma;
  const invalido = rows.some((r) => {
    const v = parse(valores[r.eventId] ?? "");
    return Number.isNaN(v) || v < 0 || v > 100;
  });

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="month" value={month} />
      {state.message ? <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert> : null}
      <Table>
        <thead>
          <tr>
            <Th>Evento</Th>
            <Th className="text-right">Gasto calculado</Th>
            <Th className="text-right">% calculado</Th>
            <Th className="text-right">% asignado</Th>
            <Th className="text-right">Monto asignado</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const v = parse(valores[r.eventId] ?? "");
            const editado = Number.isFinite(v) && Math.abs(v - round2(r.calcPct)) >= 0.01;
            return (
              <tr key={r.eventId}>
                <Td>
                  <div className="font-medium">{r.name}</div>
                  {editado ? <span className="text-xs text-amber-700 dark:text-amber-300">Editado (cálculo: {pctFmt(r.calcPct)})</span> : null}
                </Td>
                <Td className="text-right tabular-nums">{usd.format(r.usd)}</Td>
                <Td className="text-right tabular-nums text-muted-foreground">{pctFmt(r.calcPct)}</Td>
                <Td className="text-right">
                  {canEdit ? (
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        name={`pct_${r.eventId}`}
                        value={valores[r.eventId] ?? ""}
                        onChange={(e) => setValores({ ...valores, [r.eventId]: e.target.value })}
                        inputMode="decimal"
                        className="h-8 w-24 text-right tabular-nums"
                        aria-label={`% asignado a ${r.name}`}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  ) : (
                    <span className="tabular-nums">{pctFmt(Number.isFinite(v) ? v : r.calcPct)}</span>
                  )}
                </Td>
                <Td className="text-right font-medium tabular-nums">{Number.isFinite(v) ? usd.format((v / 100) * monthTotal) : "—"}</Td>
              </tr>
            );
          })}
          <tr>
            <Td className="text-muted-foreground">Orgánico / sin asignar</Td>
            <Td className="text-right tabular-nums text-muted-foreground">{usd.format(organicUsd)}</Td>
            <Td className="text-right tabular-nums text-muted-foreground">{pctFmt(monthTotal ? (organicUsd / monthTotal) * 100 : 0)}</Td>
            <Td className={`text-right tabular-nums ${resto < -0.005 ? "text-destructive" : "text-muted-foreground"}`}>{pctFmt(resto)}</Td>
            <Td className="text-right tabular-nums text-muted-foreground">{usd.format((Math.max(resto, 0) / 100) * monthTotal)}</Td>
          </tr>
          <tr className="font-semibold">
            <Td>Total de {monthLabel}</Td>
            <Td className="text-right tabular-nums">{usd.format(monthTotal)}</Td>
            <Td className="text-right tabular-nums">{pctFmt(100)}</Td>
            <Td className={`text-right tabular-nums ${suma > 100.005 ? "text-destructive" : ""}`}>{pctFmt(suma + Math.max(resto, 0))}</Td>
            <Td className="text-right tabular-nums">{usd.format(monthTotal)}</Td>
          </tr>
        </tbody>
      </Table>
      {suma > 100.005 ? <Alert>La suma de los eventos es {pctFmt(suma)}: no puede superar el 100 %.</Alert> : null}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="modo" value="guardar" disabled={pending || invalido || suma > 100.005}>
            {pending ? "Guardando…" : "Guardar porcentajes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setValores(Object.fromEntries(rows.map((r) => [r.eventId, String(round2(r.calcPct))])))}
          >
            Volver a los valores calculados
          </Button>
          {hayGuardados ? (
            <Button type="submit" name="modo" value="restablecer" variant="ghost" disabled={pending}>
              Borrar reparto guardado
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
