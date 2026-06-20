"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, Loader2, ChevronLeft, ChevronRight, Clock, MapPin, CalendarDays, CheckCircle2, CircleDashed } from "lucide-react";
import Image from "next/image";
import { motion } from "framer-motion";

interface FormattedLog {
    id: string;
    check_in_time: string;
    check_out_time: string | null;
    status: string;
    department: string;
    worker_name: string;
    avatar_url: string | null;
    event_title: string;
}

interface HistoryClientProps {
    logs: FormattedLog[];
    currentPage: number;
    totalPages: number;
    totalCount: number;
    initialSearch: string;
}

export default function HistoryClient({ logs, currentPage, totalPages, totalCount, initialSearch }: HistoryClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    
    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [isSearching, setIsSearching] = useState(false);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchTerm !== initialSearch) {
                setIsSearching(true);
                const params = new URLSearchParams(searchParams.toString());
                if (searchTerm) {
                    params.set('search', searchTerm);
                } else {
                    params.delete('search');
                }
                params.set('page', '1'); // Reset to page 1 on new search
                
                router.push(`${pathname}?${params.toString()}`);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchTerm, initialSearch, pathname, router, searchParams]);

    // Reset searching state when data arrives
    useEffect(() => {
        setIsSearching(false);
    }, [logs]);

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages) return;
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', newPage.toString());
        router.push(`${pathname}?${params.toString()}`);
    };

    const formatTime = (isoString: string) => {
        return new Date(isoString).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    };

    const formatDate = (isoString: string) => {
        return new Date(isoString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-800 dark:text-white/90">Attendance History</h1>
                    <p className="text-neutral-500 dark:text-white/50 mt-1">Global audit trail of all check-ins ({totalCount} records)</p>
                </div>

                <div className="relative w-full md:w-72">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        {isSearching ? (
                            <Loader2 className="w-4 h-4 text-neutral-400 animate-spin" />
                        ) : (
                            <Search className="w-4 h-4 text-neutral-400" />
                        )}
                    </div>
                    <input
                        type="text"
                        placeholder="Search by worker name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-[14px] text-neutral-800 dark:text-white/90 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all shadow-sm"
                    />
                </div>
            </div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-[#0f0f0f] rounded-2xl border border-neutral-200 dark:border-white/10 shadow-sm overflow-hidden"
            >
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-neutral-50/50 dark:bg-white/[0.02] border-b border-neutral-200 dark:border-white/10 text-[12px] font-semibold text-neutral-500 dark:text-white/40 uppercase tracking-wider">
                                <th className="px-6 py-4">Worker & Session</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4 text-right">Time Log</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 dark:divide-white/10">
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-neutral-500 dark:text-white/40 text-[14px]">
                                        No attendance records found.
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => {
                                    const init = `${log.worker_name[0] || 'U'}`.toUpperCase();
                                    return (
                                        <tr key={log.id} className="hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-[#34A853]/10 border border-[#34A853]/20 flex items-center justify-center text-xs font-bold text-[#34A853] overflow-hidden relative shrink-0">
                                                        {log.avatar_url ? (
                                                            <Image src={log.avatar_url} alt={log.worker_name} fill className="object-cover" sizes="40px" />
                                                        ) : (
                                                            init
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-[14px] font-medium text-neutral-800 dark:text-white/90 group-hover:text-[#34A853] transition-colors">
                                                            {log.worker_name}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-0.5 text-[12px] text-neutral-500 dark:text-white/50">
                                                            <span>{log.department}</span>
                                                            <span className="w-1 h-1 rounded-full bg-neutral-300 dark:bg-white/20"></span>
                                                            <span className="truncate max-w-[150px]">{log.event_title}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {log.status === 'active' ? (
                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#34A853]/10 text-[#34A853] border border-[#34A853]/20 text-[11px] font-semibold uppercase tracking-wide">
                                                        <CircleDashed className="w-3 h-3 animate-[spin_3s_linear_infinite]" />
                                                        Active Now
                                                    </div>
                                                ) : (
                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-white/60 border border-neutral-200 dark:border-white/10 text-[11px] font-semibold uppercase tracking-wide">
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        Completed
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-[14px] text-neutral-600 dark:text-white/70">
                                                    <CalendarDays className="w-4 h-4 opacity-50" />
                                                    {formatDate(log.check_in_time)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex flex-col items-end gap-1 font-mono text-[13px]">
                                                    <div className="flex items-center gap-2 text-[#34A853]">
                                                        <span>In: {formatTime(log.check_in_time)}</span>
                                                    </div>
                                                    {log.check_out_time ? (
                                                        <div className="flex items-center gap-2 text-neutral-500 dark:text-white/50">
                                                            <span>Out: {formatTime(log.check_out_time)}</span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-neutral-400 dark:text-white/30 text-[11px] uppercase tracking-wider">
                                                            Ongoing
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02]">
                        <p className="text-[13px] text-neutral-500 dark:text-white/50">
                            Showing page <span className="font-semibold text-neutral-700 dark:text-white/80">{currentPage}</span> of <span className="font-semibold text-neutral-700 dark:text-white/80">{totalPages}</span>
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg border border-neutral-200 dark:border-white/10 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-lg border border-neutral-200 dark:border-white/10 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
