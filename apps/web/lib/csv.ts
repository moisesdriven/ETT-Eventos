import "server-only";
import { toLimaDay } from "@ett/core";
import { audit } from "./audit";
import { can } from "./auth/permissions";
import { getCurrentUser, type SessionUser } from "./auth/session";

type Cell = string | number | null | undefined;

function escape(v: Cell): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Evita inyección de fórmulas al abrir en Excel.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  // BOM para que Excel reconozca UTF-8 (tildes y ñ).
  return "﻿" + [header, ...rows].map((r) => r.map(escape).join(",")).join("\r\n") + "\r\n";
}

export function csvResponse(name: string, csv: string): Response {
  const file = `${name}-${toLimaDay(new Date())}.csv`.replace(/[^a-z0-9._-]/gi, "_");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Sesión válida + permiso de exportación; registra la exportación en auditoría. */
export async function requireExport(kind: string, metadata: Record<string, unknown> = {}): Promise<SessionUser | Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("No autenticado", { status: 401 });
  if (!can(user.role, "datos.exportar")) return new Response("Sin permiso", { status: 403 });
  await audit({ userId: user.id, action: `exportar.${kind}`, metadata });
  return user;
}

/** Montos con 6 decimales tal como están en la base (sin redondeo). */
export const usd = (v: number | string) => Number(v).toFixed(6);
