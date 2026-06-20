"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Users, Activity, LogOut, LayoutDashboard, Menu, X, History, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Image from "next/image";
import ThemeToggle from "./ThemeToggle";

const navLinks = [
    { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { name: "Events", href: "/admin/events", icon: Calendar },
    { name: "Live Session", href: "/admin/sessions", icon: Activity },
    { name: "Workers", href: "/admin/workers", icon: Users },
    { name: "History", href: "/admin/history", icon: History },
    { name: "Locations", href: "/admin/locations", icon: MapPin },
];

export default function AdminNavigation({
    initial
}: {
    initial: string;
}) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    // Close mobile menu when route changes
    useEffect(() => {
        setIsMobileMenuOpen(false);
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

    const SidebarContent = () => (
        <>
            {/* Logo */}
            <div className="h-20 flex items-center gap-3 px-6 border-b border-neutral-200 dark:border-white/10 shrink-0">
                <div className="relative h-8 w-8">
                    <Image
                        src="/logo.png"
                        alt="Harvesters Logo"
                        fill
                        sizes="32px"
                        className="object-contain dark:invert-0 invert"
                    />
                </div>
                <span className="font-bold text-sm tracking-wide text-neutral-900 dark:text-white uppercase">
                    Admin Portal
                </span>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 py-8 px-4 flex flex-col gap-2 overflow-y-auto">
                {navLinks.map((link) => {
                    const isActive = pathname === link.href;
                    const Icon = link.icon;

                    return (
                        <Link
                            key={link.name}
                            href={link.href}
                            className={`relative flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                                isActive 
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
                            <Icon className="w-5 h-5 relative z-10" />
                            <span className="relative z-10">{link.name}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Logout Button */}
            <div className="p-4 border-t border-neutral-200 dark:border-white/10 shrink-0">
                <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors font-medium"
                >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                </button>
            </div>
        </>
    );

    return (
        <>
            {/* DESKTOP SIDEBAR */}
            <aside className="fixed inset-y-0 left-0 w-64 bg-background border-r border-neutral-200 dark:border-white/10 hidden md:flex flex-col z-50">
                <SidebarContent />
            </aside>

            {/* MOBILE HEADER */}
            <header className="md:hidden h-20 border-b border-neutral-200 dark:border-white/10 bg-white/50 dark:bg-background/50 backdrop-blur-xl sticky top-0 z-40 flex items-center justify-between px-6">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="p-2 -ml-2 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <div className="relative h-7 w-7">
                        <Image
                            src="/logo.png"
                            alt="Harvesters Logo"
                            fill
                            sizes="28px"
                            className="object-contain dark:invert-0 invert"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
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
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <SidebarContent />
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
