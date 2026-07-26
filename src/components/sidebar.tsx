"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  User,
  CalendarCheck,
  Megaphone,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const workerItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: User, label: "My Profile", href: "/profile" },
  { icon: CalendarCheck, label: "Attendance", href: "/attendance" },
  { icon: Megaphone, label: "Announcements", href: "/announcements" },
  { icon: Users, label: "My Department", href: "/department" },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-full flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center border-b border-slate-200 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-black text-white overflow-hidden mr-3">
          <img src="/Harvester-icon.png" alt="Harvesters Icon" className="h-5 w-5 object-contain" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">ChurchHub</h1>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {workerItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      
      <div className="border-t border-slate-200 p-4">
        <Link
          href="/"
          onClick={(e) => {
            // We'll let the Link handle navigation, but clear localStorage first
            localStorage.removeItem("church_hub_auth_id");
          }}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 mb-4"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          Log out
        </Link>
        <div className="rounded-md bg-slate-50 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Need help?</h4>
          <p className="mt-1 text-xs text-slate-500">
            Contact the IT department at support@harvesters.org
          </p>
        </div>
      </div>
    </div>
  );
}
