"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { createUserAction, resetPasswordAction, updateUserAction } from "./actions";

const ROLES = Object.entries(ROLE_LABELS) as [keyof typeof ROLE_LABELS, string][];

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, initialActionState);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      {state.message ? (
        <Alert tone={state.ok ? "success" : "error"} className="sm:col-span-2">
          {state.message}
        </Alert>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-name">Nombre</Label>
        <Input id="new-name" name="name" required defaultValue={state.values?.name} />
        <FieldError errors={state.fieldErrors?.name} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-email">Correo</Label>
        <Input id="new-email" name="email" type="email" required defaultValue={state.values?.email} />
        <FieldError errors={state.fieldErrors?.email} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-role">Rol</Label>
        <Select id="new-role" name="role" defaultValue={state.values?.role ?? "lectura"} key={state.values?.role ?? "lectura"}>
          {ROLES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">Contraseña temporal</Label>
        <Input id="new-password" name="password" type="password" autoComplete="new-password" required />
        <FieldError errors={state.fieldErrors?.password} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear usuario"}
        </Button>
      </div>
    </form>
  );
}

export function UserRowForm({ userId, role, active }: { userId: string; role: string; active: boolean }) {
  const [state, action, pending] = useActionState(updateUserAction, initialActionState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <Select name="role" defaultValue={role} aria-label="Rol" className="h-8 w-36">
        {ROLES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Select name="active" defaultValue={String(active)} aria-label="Estado" className="h-8 w-28">
        <option value="true">Activo</option>
        <option value="false">Inactivo</option>
      </Select>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Guardar
      </Button>
      {state.message ? <span className={state.ok ? "text-xs text-emerald-600" : "text-xs text-destructive"}>{state.message}</span> : null}
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initialActionState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <Input name="password" type="password" placeholder="Nueva contraseña" autoComplete="new-password" className="h-8 w-44" aria-label="Nueva contraseña" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Restablecer
      </Button>
      {state.fieldErrors?.password ? <span className="text-xs text-destructive">{state.fieldErrors.password[0]}</span> : null}
      {state.message ? <span className={state.ok ? "text-xs text-emerald-600" : "text-xs text-destructive"}>{state.message}</span> : null}
    </form>
  );
}
