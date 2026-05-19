import { Link, useLocation } from "wouter";
import { Bot, Hash, LayoutDashboard, Activity, Settings, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", icon: LayoutDashboard, label: "Дашборд" },
  { href: "/agents", icon: Bot, label: "Агенты" },
  { href: "/channels", icon: Hash, label: "Каналы" },
  { href: "/activity", icon: Activity, label: "Активность" },
  { href: "/settings", icon: Settings, label: "Настройки" },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();

  return (
    <aside className="w-56 flex-shrink-0 hidden md:flex flex-col border-r border-sidebar-border bg-sidebar h-screen">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-sidebar-foreground leading-none">FavoriteChat</p>
          <p className="text-xs text-muted-foreground mt-0.5">Multi-Agent</p>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              data-testid={`nav-${label.toLowerCase()}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-2 py-3 border-t border-sidebar-border">
        <button
          onClick={toggle}
          data-testid="button-theme-toggle"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium w-full text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        </button>
      </div>
    </aside>
  );
}
