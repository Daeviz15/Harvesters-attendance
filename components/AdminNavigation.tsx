"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Users, Activity, LogOut, LayoutDashboard, Menu, X, History, MapPin, Building2, Shield, MailCheck, ClipboardList, ArrowLeftRight, CircleHelp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Image from "next/image";
import ThemeToggle from "./ThemeToggle";
import AdminNotificationBell from "./AdminNotificationBell";
import type { AdminNotification } from "@/lib/types";

const allNavLinks = [
    { name: "Dashboard", href: "/admin", icon: LayoutDashboard, superAdminOnly: false },
    { name: "Events", href: "/admin/events", icon: Calendar, superAdminOnly: false },
    { name: "Live Session", href: "/admin/sessions", icon: Activity, superAdminOnly: false },
    { name: "Check-in Help", href: "/admin/check-in-assistance", icon: CircleHelp, superAdminOnly: false },
    { name: "Workers", href: "/admin/workers", icon: Users, superAdminOnly: false },
    { name: "Leave Requests", href: "/admin/leave-requests", icon: ClipboardList, superAdminOnly: false },
    { name: "Departments", href: "/admin/departments", icon: Building2, superAdminOnly: true },
    { name: "Reports", href: "/admin/reports", icon: History, superAdminOnly: false },
    { name: "Locations", href: "/admin/locations", icon: MapPin, superAdminOnly: true },
    { name: "Email Test", href: "/admin/email-test", icon: MailCheck, superAdminOnly: true, developmentOnly: true },
];

interface AdminNavigationProps {
    initial: string;
    userId: string;
    initialNotifications: AdminNotification[];
    initialUnreadCount: number;
    isSuperAdmin?: boolean;
    isReportsOnlyAdmin?: boolean;
    scopeSummary?: string;
}

function AdminSidebarContent({
    pathname,
    onSignOut,
    isSuperAdmin = true,
    isReportsOnlyAdmin = false,
    scopeSummary = "Admin Portal",
}: {
    pathname: string;
    onSignOut: () => void;
    isSuperAdmin?: boolean;
    isReportsOnlyAdmin?: boolean;
    scopeSummary?: string;
}) {
    const router = useRouter();
    const navLinks = allNavLinks.filter((link) => {
        if (isReportsOnlyAdmin) return link.href === "/admin/reports";
        if (link.developmentOnly && process.env.NODE_ENV !== "development") return false;
        return !link.superAdminOnly || isSuperAdmin;
    });

    return (
        <>
            {/* Header Brand & Scope Badge */}
            <div className="h-20 flex flex-col justify-center px-6 border-b border-neutral-200 dark:border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="relative h-7 w-7">
                        <Image
                            src="/logo.png"
                            alt="Harvesters Logo"
                            fill
                            sizes="28px"
                            className="object-contain dark:invert-0 invert"
                        />
                    </div>
                    <span className="font-bold text-sm tracking-wide text-neutral-900 dark:text-white uppercase">
                        Admin Portal
                    </span>
                </div>

                {/* Scope Badge */}
                <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#34A853] bg-[#34A853]/10 dark:bg-[#34A853]/20 px-2.5 py-0.5 rounded-full w-fit max-w-full truncate">
                    <Shield className="w-3 h-3 shrink-0" />
                    <span className="truncate">{scopeSummary}</span>
                </div>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 py-6 px-4 flex flex-col gap-1.5 overflow-y-auto">
                {navLinks.map((link) => {
                    const isActive = pathname === link.href;
                    const Icon = link.icon;

                    return (
                        <Link
                            key={link.name}
                            href={link.href}
                            className={`relative flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActive
                                    ? "text-[#34A853] font-semibold"
                                    : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 dark:text-neutral-400 dark:hover:text-white"
                                }`}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="admin-active-nav"
                                    className="absolute inset-0 bg-[#34A853]/10 dark:bg-[#34A853]/20 rounded-xl"
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                            )}
                            <Icon className="w-5 h-5 relative z-10 shrink-0" />
                            <span className="relative z-10">{link.name}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Worker/Admin Mode Switch + Logout */}
            <div className="p-4 border-t border-neutral-200 dark:border-white/10 shrink-0">
                <Link
                    href="/dashboard"
                    prefetch={false}
                    onClick={() => router.refresh()}
                    className="mb-2 flex w-full items-center gap-3 px-4 py-3 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 dark:text-neutral-400 dark:hover:text-white rounded-xl transition-colors font-medium text-sm"
                >
                    <ArrowLeftRight className="w-5 h-5 shrink-0" />
                    Switch to Worker View
                </Link>
                <button
                    onClick={onSignOut}
                    className="flex w-full items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors font-medium text-sm"
                >
                    <LogOut className="w-5 h-5 shrink-0" />
                    Sign Out
                </button>
            </div>
        </>
    );
}

export default function AdminNavigation({
    initial,
    userId,
    initialNotifications,
    initialUnreadCount,
    isSuperAdmin = true,
    isReportsOnlyAdmin = false,
    scopeSummary = "Admin Portal",
}: AdminNavigationProps) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    // Close mobile menu when route changes
    useEffect(() => {
        const timer = setTimeout(() => setIsMobileMenuOpen(false), 0);
        return () => clearTimeout(timer);
    }, [pathname]);

    // Lock body scroll when mobile menu is open
    useEffect(() => {
        if (isMobileMenuOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => { document.body.style.overflow = ""; };
    }, [isMobileMenuOpen]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push("/auth/login");
        router.refresh();
    };

    return (
        <>
            {/* DESKTOP SIDEBAR */}
            <aside className="fixed inset-y-0 left-0 w-64 bg-background border-r border-neutral-200 dark:border-white/10 hidden md:flex flex-col z-50">
                <AdminSidebarContent
                    pathname={pathname}
                    onSignOut={handleSignOut}
                    isSuperAdmin={isSuperAdmin}
                    isReportsOnlyAdmin={isReportsOnlyAdmin}
                    scopeSummary={scopeSummary}
                />
            </aside>

            {/* Fixed header for both mobile and desktop admin surfaces. */}
            <header className="fixed inset-x-0 top-0 z-40 flex h-20 items-center justify-between border-b border-neutral-200 bg-white/90 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-background/90 sm:px-6 md:left-64 lg:px-8">
                <div className="flex min-w-0 items-center gap-3">
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="-ml-2 rounded-lg p-2 text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/5 md:hidden"
                        aria-label="Open admin navigation"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <div className="relative h-7 w-7 md:hidden">
                        <Image
                            src="/logo.png"
                            alt="Harvesters Logo"
                            fill
                            sizes="28px"
                            className="object-contain dark:invert-0 invert"
                        />
                    </div>
                    <div className="hidden min-w-0 items-center gap-3 md:flex">
                        <h1 className="shrink-0 text-xl font-bold text-neutral-900 dark:text-white">
                            Admin Overview
                        </h1>
                        <span className="truncate rounded-full border border-[#34A853]/20 bg-[#34A853]/10 px-3 py-1 text-xs font-semibold text-[#34A853] dark:bg-[#34A853]/20">
                            {scopeSummary}
                        </span>
                    </div>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
                    <Link
                        href="/dashboard"
                        prefetch={false}
                        onClick={() => router.refresh()}
                        className="mr-1 hidden text-xs font-semibold uppercase tracking-wider text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white lg:block"
                    >
                        Switch to Worker View
                    </Link>
                    {!isReportsOnlyAdmin && (
                        <AdminNotificationBell
                            userId={userId}
                            initialNotifications={initialNotifications}
                            initialUnreadCount={initialUnreadCount}
                        />
                    )}
                    <ThemeToggle />
                    <div className="h-9 w-9 rounded-full bg-[#34A853]/10 flex items-center justify-center border border-[#34A853]/20 text-[#34A853] font-bold shadow-inner text-sm">
                        {initial}
                    </div>
                </div>
            </header>

            {/* MOBILE MENU OVERLAY */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        />
                        <motion.aside
                            initial={{ x: "-100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "-100%" }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            className="md:hidden fixed inset-y-0 left-0 w-[280px] bg-background border-r border-white/10 flex flex-col z-50 shadow-2xl"
                        >
                            <div className="absolute top-6 right-4 z-50">
                                <button
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                                    aria-label="Close admin navigation"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <AdminSidebarContent
                                pathname={pathname}
                                onSignOut={handleSignOut}
                                isSuperAdmin={isSuperAdmin}
                                isReportsOnlyAdmin={isReportsOnlyAdmin}
                                scopeSummary={scopeSummary}
                            />
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
