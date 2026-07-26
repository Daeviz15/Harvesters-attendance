import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Building2,
  Network,
  ChevronLeft,
  ChevronRight,
  User,
  CalendarCheck,
  Megaphone,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/role-context";

type Item = { title: string; url: string; icon: typeof LayoutDashboard };

const adminItems: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Workers", url: "/workers", icon: Users },
  { title: "Departments", url: "/departments", icon: Building2 },
  { title: "Organogram", url: "/organogram", icon: Network },
];

const workerItems: Item[] = [
  { title: "My Dashboard", url: "/worker", icon: LayoutDashboard },
  { title: "My Profile", url: "/worker/profile", icon: User },
  { title: "Attendance", url: "/worker/attendance", icon: CalendarCheck },
  { title: "Announcements", url: "/worker/announcements", icon: Megaphone },
  { title: "Department", url: "/worker/department", icon: Building2 },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();
  const { role } = useRole();
  const isWorker = role === "worker";
  const items = isWorker ? workerItems : adminItems;

  return (
    <aside
      className={cn(
        "sticky top-0 h-screen shrink-0 border-r border-slate-200 bg-slate-900 text-slate-100 transition-all duration-200 flex flex-col",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-slate-800 px-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black text-white overflow-hidden">
            <img src="/Harvester-icon.png" alt="Harvesters Icon" className="h-5 w-5 object-contain" />
          </div>
          {!collapsed && <span className="truncate text-sm font-semibold">Harvesters Church Management System</span>}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          aria-label="toggle sidebar"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      <nav className="flex-1 p-2">
        {items.map((item) => {
          const homeUrl = isWorker ? "/worker" : "/dashboard";
          const active =
            item.url === homeUrl ? pathname === homeUrl : pathname.startsWith(item.url);
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );
        })}
      </nav>
      {isWorker && (
        <div className="border-t border-slate-800 p-2">
          <Link
            to="/auth/login"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </Link>
        </div>
      )}
    </aside>
  );
}
