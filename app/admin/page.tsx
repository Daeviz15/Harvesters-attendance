import { createClient } from "@/utils/supabase/server";
import { Users, Activity, Calendar } from "lucide-react";
import Link from "next/link";

export default async function AdminDashboardPage() {
    const supabase = await createClient();

    // Get basic stats
    const { count: workerCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'worker');

    const { count: activeSessionsCount } = await supabase
        .from('attendance_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

    const { count: totalEventsCount } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true });

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white mb-2">
                    Dashboard Overview
                </h1>
                <p className="text-neutral-500 dark:text-neutral-400">
                    Welcome to the Harvesters Attendance Admin Portal.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Stats Cards */}
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-neutral-700 dark:text-neutral-300">Active Sessions</h3>
                        <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                            <Activity className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-4xl font-bold text-neutral-900 dark:text-white">
                        {activeSessionsCount || 0}
                    </p>
                    <div className="mt-4">
                        <Link href="/admin/sessions" className="text-sm font-medium text-[#34A853] hover:underline">
                            Manage sessions →
                        </Link>
                    </div>
                </div>

                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-neutral-700 dark:text-neutral-300">Registered Workers</h3>
                        <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-[#34A853]/10 flex items-center justify-center text-[#34A853]">
                            <Users className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-4xl font-bold text-neutral-900 dark:text-white">
                        {workerCount || 0}
                    </p>
                    <div className="mt-4">
                        <Link href="/admin/workers" className="text-sm font-medium text-[#34A853] hover:underline">
                            View all workers →
                        </Link>
                    </div>
                </div>

                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-neutral-700 dark:text-neutral-300">Total Events</h3>
                        <div className="w-10 h-10 rounded-full bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400">
                            <Calendar className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-4xl font-bold text-neutral-900 dark:text-white">
                        {totalEventsCount || 0}
                    </p>
                    <div className="mt-4">
                        <Link href="/admin/events" className="text-sm font-medium text-[#34A853] hover:underline">
                            Manage events →
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
