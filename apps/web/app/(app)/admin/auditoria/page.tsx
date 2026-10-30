import { auditLogs, users } from "@ett/db";
import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTimeLima } from "@/lib/utils";

export const metadata: Metadata = { title: "Auditoría" };

const ACTION_LABELS: Record<string, string> = {
  "sesion.inicio": "Inicio de sesión",
  "sesion.fallida": "Intento de ingreso fallido",
  "sesion.cierre": "Cierre de sesión",
  "usuario.crear": "Usuario creado",
  "usuario.actualizar": "Usuario actualizado",
  "usuario.restablecer_contrasena": "Contraseña restablecida",
  "usuario.cambiar_contrasena": "Cambio de contraseña propia",
  "usuario.admin_cli": "Administrador creado por consola",
};

export default async function AuditPage() {
  await requirePermission("auditoria.ver");
  const rows = await db
    .select({
      id: auditLogs.id,
      createdAt: auditLogs.createdAt,
      action: auditLogs.action,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      ip: auditLogs.ip,
      email: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .orderBy(desc(auditLogs.id))
    .limit(200);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Auditoría</h1>
        <p className="text-sm text-muted-foreground">Últimos 200 registros, en hora de Lima.</p>
      </div>
      <Card>
        <CardContent className="pt-5">
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Usuario</Th>
                <Th>Acción</Th>
                <Th>Detalle</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{formatDateTimeLima(r.createdAt)}</Td>
                  <Td>{r.email ?? "—"}</Td>
                  <Td>{ACTION_LABELS[r.action] ?? r.action}</Td>
                  <Td className="max-w-md truncate font-mono text-xs text-muted-foreground">{r.metadata ? JSON.stringify(r.metadata) : (r.entityId ?? "")}</Td>
                  <Td className="font-mono text-xs">{r.ip ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
