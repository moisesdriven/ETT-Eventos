"use client";

import { Button } from "@/components/ui/button";

/** Botón de envío que pide confirmación antes de una acción irreversible. */
export function ConfirmButton({ message, ...props }: React.ComponentProps<typeof Button> & { message: string }) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
