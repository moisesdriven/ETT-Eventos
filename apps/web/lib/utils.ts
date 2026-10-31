import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateTimeLima = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTimeLima(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dateTimeLima.format(typeof value === "string" ? new Date(value) : value);
}
