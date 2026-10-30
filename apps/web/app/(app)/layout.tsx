import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { Nav, type NavItem } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items: NavItem[] = [
    { href: "/", label: "Dashboard", icon: "dashboard" },
    { href: "/eventos", label: "Etiquetas de evento", icon: "tags", soon: true },
    { href: "/numeros", label: "Números de WhatsApp", icon: "phone", soon: true },
    ...(can(user.role, "sincronizacion.gestionar") ? [{ href: "/sincronizacion", label: "Sincronización", icon: "sync", soon: true } as const] : []),
    ...(can(user.role, "usuarios.gestionar") ? [{ href: "/admin/usuarios", label: "Usuarios", icon: "users" } as const] : []),
    ...(can(user.role, "auditoria.ver") ? [{ href: "/admin/auditoria", label: "Auditoría", icon: "audit" } as const] : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b bg-card p-4 md:w-64 md:border-r md:border-b-0">
        <div className="px-2 text-lg font-semibold">ETT Eventos</div>
        <Nav items={items} />
        <div className="mt-auto flex flex-col gap-2 border-t pt-4 text-sm">
          <a href="/cuenta" className="rounded-md px-2 py-1 hover:bg-muted">
            <div className="font-medium">{user.name}</div>
            <div className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</div>
          </a>
          <form action={logoutAction}>
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <LogOut className="size-4" aria-hidden /> Cerrar sesión
            </Button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
