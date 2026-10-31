import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  danger: "bg-red-500/15 text-red-700 dark:text-red-300",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
} as const;

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />;
}
