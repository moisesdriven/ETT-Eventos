import { cn } from "@/lib/utils";

export function Alert({ tone = "error", className, ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: "error" | "success" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        tone === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        className,
      )}
      {...props}
    />
  );
}
