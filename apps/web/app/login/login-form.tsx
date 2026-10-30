"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, initialActionState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.message ? <Alert>{state.message}</Alert> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus defaultValue={state.values?.email} />
        <FieldError errors={state.fieldErrors?.email} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
        <FieldError errors={state.fieldErrors?.password} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
