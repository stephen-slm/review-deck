import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  GitPullRequest,
  Eye,
  CheckCircle,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/my-prs", label: "My PRs", icon: GitPullRequest },
  { to: "/review-requests", label: "Review Requests", icon: Eye },
  { to: "/reviewed", label: "Reviewed by Me", icon: CheckCircle },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const { isAuthenticated, user, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-card">
      <div className="wails-drag flex h-14 items-center border-b border-border px-4">
        <h1 className="text-lg font-semibold text-foreground">Review Deck</h1>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        {isAuthenticated && user ? (
          <div className="flex items-center gap-2">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.login}
                className="h-6 w-6 rounded-full"
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-medium">
                {user.login[0]?.toUpperCase()}
              </div>
            )}
            <span className="truncate text-xs text-muted-foreground">
              {user.login}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Not connected</p>
        )}
      </div>
    </aside>
  );
}
