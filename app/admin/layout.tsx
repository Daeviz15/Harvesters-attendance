import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import AdminNavigation from '@/components/AdminNavigation';
import ThemeToggle from '@/components/ThemeToggle';
import Link from 'next/link';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        redirect('/auth/login');
    }

    // Verify admin role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, first_name, last_name')
        .eq('id', user.id)
        .single();

    if (!profile || profile.role !== 'admin') {
        // Redirect non-admins to the standard dashboard
        redirect('/dashboard');
    }

    const initial = `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase() || 'AD';

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-background text-foreground flex flex-col md:flex-row">
            {/* Navigation Handles both Desktop Sidebar and Mobile Header/Drawer */}
            <AdminNavigation initial={initial} />

            {/* Main Content Area */}
            <div className="flex-1 md:ml-64 flex flex-col min-h-screen relative z-10">
                {/* Desktop Top Header */}
                <header className="hidden md:flex h-20 border-b border-neutral-200 dark:border-white/10 bg-white/50 dark:bg-background/50 backdrop-blur-xl sticky top-0 z-40 items-center justify-between px-6 lg:px-10">
                    <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
                        Admin Overview
                    </h1>
                    
                    <div className="flex items-center gap-4 ml-auto">
                        <Link 
                            href="/dashboard"
                            className="text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors mr-2"
                        >
                            Switch to Worker View
                        </Link>
                        <ThemeToggle />
                        <div className="h-10 w-10 rounded-full bg-[#34A853]/10 flex items-center justify-center border border-[#34A853]/20 text-[#34A853] font-bold shadow-inner text-sm">
                            {initial}
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
