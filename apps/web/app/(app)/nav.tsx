"use client";

import { Activity, LayoutDashboard, Phone, RefreshCw, ScrollText, Tags, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  tags: Tags,
  phone: Phone,
  sync: RefreshCw,
  users: Users,
  audit: ScrollText,
  activity: Activity,
} as const;

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  soon?: boolean;
}

export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        if (item.soon) {
          return (
            <span key={item.href} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground/70" title="Disponible en una próxima fase">
              <Icon className="size-4" aria-hidden />
              {item.label}
              <span className="ml-auto text-[10px] uppercase">pronto</span>
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted", active && "bg-muted font-medium")}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
