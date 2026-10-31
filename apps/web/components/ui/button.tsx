import { cn } from "@/lib/utils";

const variants = {
  default: "bg-primary text-primary-foreground hover:opacity-90",
  outline: "border bg-card hover:bg-muted",
  ghost: "hover:bg-muted",
  destructive: "bg-destructive text-white hover:opacity-90",
} as const;

const sizes = { default: "h-9 px-4", sm: "h-8 px-3 text-xs" } as const;

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: keyof typeof sizes }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
