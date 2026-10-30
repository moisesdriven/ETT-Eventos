import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/session";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requirePermission("dashboard.ver");
  const { error } = await searchParams;
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Hola, {user.name}</h1>
        <p className="text-sm text-muted-foreground">Panel de costos de WhatsApp por evento, número y día (hora de Lima).</p>
      </div>
      {error === "permiso" ? <Alert>No tienes permiso para ver esa sección.</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Dashboard en construcción</CardTitle>
          <CardDescription>
            Los indicadores de gasto, los gráficos y el módulo de etiquetas de evento se habilitan cuando la sincronización con GoHighLevel esté
            activa (fases 3 a 5).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Mientras tanto ya puedes gestionar usuarios, roles y revisar la auditoría de accesos.
        </CardContent>
      </Card>
    </div>
  );
}
