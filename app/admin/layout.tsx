import { requireAdminAuth } from "@/lib/rbac";
import AdminNavigation from "@/components/AdminNavigation";
import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Zero-Trust Server-Side RBAC Verification
    const { initials, isSuperAdmin, scopeSummary } = await requireAdminAuth();

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-background text-foreground flex flex-col md:flex-row">
            {/* Navigation Sidebar & Mobile Header */}
            <AdminNavigation 
                initial={initials} 
                isSuperAdmin={isSuperAdmin}
                scopeSummary={scopeSummary}
            />

            {/* Main Content Area */}
            <div className="flex-1 md:ml-64 flex flex-col min-h-screen relative z-10">
                {/* Desktop Top Header */}
                <header className="hidden md:flex h-20 border-b border-neutral-200 dark:border-white/10 bg-white/50 dark:bg-background/50 backdrop-blur-xl sticky top-0 z-40 items-center justify-between px-6 lg:px-10">
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
                            Admin Overview
                        </h1>
                        <span className="text-xs font-semibold text-[#34A853] bg-[#34A853]/10 dark:bg-[#34A853]/20 px-3 py-1 rounded-full border border-[#34A853]/20">
                            {scopeSummary}
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-4 ml-auto">
                        <Link 
                            href="/dashboard"
                            className="text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors mr-2"
                        >
                            Switch to Worker View
                        </Link>
                        <ThemeToggle />
                        <div className="h-10 w-10 rounded-full bg-[#34A853]/10 flex items-center justify-center border border-[#34A853]/20 text-[#34A853] font-bold shadow-inner text-sm">
                            {initials}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-6 lg:p-10 max-w-7xl mx-auto w-full">
                    {children}
                </main>
            </div>
        </div>
    );
}
