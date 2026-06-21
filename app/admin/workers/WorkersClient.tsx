"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, User, Mail, Building2, Shield, CalendarDays, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { motion } from "framer-motion";

interface Profile {
    id: string;
    first_name: string;
    last_name: string;
    department: string;
    role: string;
    avatar_url: string | null;
    created_at: string;
}

interface WorkersClientProps {
    workers: Profile[];
    currentPage: number;
    totalPages: number;
    totalCount: number;
    initialSearch: string;
}

export default function WorkersClient({ workers, currentPage, totalPages, totalCount, initialSearch }: WorkersClientProps) {
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
    }, [workers]);

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages) return;
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', newPage.toString());
        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-800 dark:text-white/90">Workers Directory</h1>
                    <p className="text-neutral-500 dark:text-white/50 mt-1">Manage and view all registered profiles ({totalCount} total)</p>
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
                        placeholder="Search workers..."
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
                                <th className="px-6 py-4">Username</th>
                                <th className="px-6 py-4">Department</th>
                                <th className="px-6 py-4">Role</th>
                                <th className="px-6 py-4">Registered On</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 dark:divide-white/10">
                            {workers.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-neutral-500 dark:text-white/40 text-[14px]">
                                        No workers found matching your search.
                                    </td>
                                </tr>
                            ) : (
                                workers.map((worker) => {
                                    const init = `${worker.first_name[0] || ''}${worker.last_name ? worker.last_name[0] : ''}`.toUpperCase();
                                    return (
                                        <tr key={worker.id} className="hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 flex items-center justify-center text-xs font-bold text-neutral-600 dark:text-white/70 overflow-hidden relative shrink-0">
                                                        {worker.avatar_url ? (
                                                            <Image src={worker.avatar_url} alt={worker.first_name} fill className="object-cover" sizes="40px" />
                                                        ) : (
                                                            init
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-[14px] font-medium text-neutral-800 dark:text-white/90 group-hover:text-[#34A853] transition-colors">
                                                            @{worker.first_name}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-[14px] text-neutral-600 dark:text-white/60">
                                                    <Building2 className="w-4 h-4 opacity-50" />
                                                    {worker.department}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase ${
                                                    worker.role === 'admin' 
                                                        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20' 
                                                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                                }`}>
                                                    {worker.role === 'admin' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                                                    {worker.role}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-[14px] text-neutral-500 dark:text-white/50 font-mono">
                                                {new Date(worker.created_at).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric'
                                                })}
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
