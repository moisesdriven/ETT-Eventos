import { users } from "@ett/db";
import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTimeLima } from "@/lib/utils";
import { CreateUserForm, ResetPasswordForm, UserRowForm } from "./forms";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsersPage() {
  const me = await requirePermission("usuarios.gestionar");
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, lastLoginAt: users.lastLoginAt })
    .from(users)
    .orderBy(asc(users.name));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Administrador: configuración, sincronización y usuarios. Analista: eventos y exportaciones. Solo lectura: ver paneles.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo usuario</CardTitle>
          <CardDescription>Comparte la contraseña temporal por un canal seguro.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateUserForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios registrados ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>Usuario</Th>
                <Th>Último ingreso</Th>
                <Th>Rol y estado</Th>
                <Th>Contraseña</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <div className="font-medium">
                      {u.name} {u.id === me.id ? <Badge tone="info">Tú</Badge> : null} {!u.active ? <Badge tone="danger">Inactivo</Badge> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDateTimeLima(u.lastLoginAt)}</Td>
                  <Td>
                    <UserRowForm userId={u.id} role={u.role} active={u.active} />
                  </Td>
                  <Td>
                    <ResetPasswordForm userId={u.id} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
