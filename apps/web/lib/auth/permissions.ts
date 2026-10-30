import type { UserRole } from "@ett/db/schema";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  analista: "Analista",
  lectura: "Solo lectura",
};

const PERMISSIONS = {
  "dashboard.ver": ["admin", "analista", "lectura"],
  "eventos.editar": ["admin", "analista"],
  "datos.exportar": ["admin", "analista"],
  "sincronizacion.gestionar": ["admin"],
  "usuarios.gestionar": ["admin"],
  "auditoria.ver": ["admin"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}
