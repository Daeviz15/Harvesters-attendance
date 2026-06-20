"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Users, Activity, LogOut, LayoutDashboard } from "lucide-react";
import { motion } from "framer-motion";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Image from "next/image";

const navLinks = [
    { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { name: "Events", href: "/admin/events", icon: Calendar },
    { name: "Live Session", href: "/admin/sessions", icon: Activity },
    { name: "Workers", href: "/admin/workers", icon: Users },
];

export default function AdminSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push("/auth/login");
        router.refresh();
    };

    return (
        <aside className="fixed inset-y-0 left-0 w-64 bg-background border-r border-neutral-200 dark:border-white/10 hidden md:flex flex-col z-50">
            {/* Logo */}
            <div className="h-20 flex items-center gap-3 px-6 border-b border-neutral-200 dark:border-white/10">
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

            {/* Navigation */}
            <nav className="flex-1 py-8 px-4 flex flex-col gap-2">
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

            {/* Logout */}
            <div className="p-4 border-t border-neutral-200 dark:border-white/10">
                <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors font-medium"
                >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                </button>
            </div>
        </aside>
    );
}
