"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initialActionState);
  return (
    <form action={action} className="flex max-w-sm flex-col gap-4" noValidate>
      {state.message ? <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current">Contraseña actual</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" />
        <FieldError errors={state.fieldErrors?.current} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Nueva contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" />
        <FieldError errors={state.fieldErrors?.password} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Repite la nueva contraseña</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" />
        <FieldError errors={state.fieldErrors?.confirm} />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}
