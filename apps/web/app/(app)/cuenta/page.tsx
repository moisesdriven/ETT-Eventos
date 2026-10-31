import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Mi cuenta</h1>
        <p className="text-sm text-muted-foreground">
          {user.email} · {ROLE_LABELS[user.role]}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
          <CardDescription>Al cambiarla se cierran tus sesiones en otros dispositivos.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
