import { Link, useLocation } from "wouter";
import { Bot, Hash, LayoutDashboard, Activity, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", icon: LayoutDashboard, label: "Дашборд" },
  { href: "/agents", icon: Bot, label: "Агенты" },
  { href: "/channels", icon: Hash, label: "Каналы" },
  { href: "/activity", icon: Activity, label: "Активность" },
  { href: "/settings", icon: Settings, label: "Настройки" },
];

export function MobileTopBar() {
  return (
    <header className="flex items-center gap-2.5 px-4 h-13 border-b border-border bg-background md:hidden flex-shrink-0">
      <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
        <Bot className="w-4 h-4 text-primary-foreground" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground leading-none">FavoriteChat</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Multi-Agent</p>
      </div>
    </header>
  );
}

export function MobileBottomNav() {
  const [location] = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex safe-area-bottom">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
