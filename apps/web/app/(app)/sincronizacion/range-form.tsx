"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { enqueueRangeAction } from "./actions";

export function RangeForm({ kind, label, defaultFrom, defaultTo }: { kind: "backfill" | "conciliacion"; label: string; defaultFrom: string; defaultTo: string }) {
  const [state, action, pending] = useActionState(enqueueRangeAction, initialActionState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="kind" value={kind} />
      {state.message ? <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert> : null}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${kind}-from`}>Desde</Label>
          <Input id={`${kind}-from`} name="fromDay" type="date" defaultValue={defaultFrom} />
          <FieldError errors={state.fieldErrors?.fromDay} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${kind}-to`}>Hasta (inclusive)</Label>
          <Input id={`${kind}-to`} name="toDay" type="date" defaultValue={defaultTo} />
          <FieldError errors={state.fieldErrors?.toDay} />
        </div>
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        {label}
      </Button>
    </form>
  );
}
