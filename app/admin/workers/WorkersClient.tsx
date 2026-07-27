"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, User, Building2, Shield, Loader2, ChevronLeft, ChevronRight, Crown, X, UserPlus, Plus, Check } from "lucide-react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { assignDepartmentHead, removeDepartmentHead, createWorkerAccount } from "./actions";

interface Profile {
    id: string;
    first_name: string;
    last_name: string;
    department: string;
    department_id: string | null;
    role: string;
    avatar_url: string | null;
    created_at: string;
    head_department_id: string | null;
    head_department_name: string | null;
    worker_id?: string | null;
}

interface DepartmentOption {
    id: string;
    name: string;
    is_active: boolean;
    head_user_id: string | null;
}

interface ActiveSessionOption {
    id: string;
    title: string;
}

interface WorkersClientProps {
    workers: Profile[];
    currentPage: number;
    totalPages: number;
    totalCount: number;
    initialSearch: string;
    selectedDepartment: string;
    departments: DepartmentOption[];
    pageSize: number;
    activeSessions?: ActiveSessionOption[];
}

export default function WorkersClient({
    workers,
    currentPage,
    totalPages,
    totalCount,
    initialSearch,
    selectedDepartment,
    departments,
    pageSize,
    activeSessions = [],
}: WorkersClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [isSearching, setIsSearching] = useState(false);
    const [busyWorkerId, setBusyWorkerId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Register worker modal state
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [registerError, setRegisterError] = useState<string | null>(null);
    const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);
    const [selectedDeptId, setSelectedDeptId] = useState<string>("");

    const handleRegisterSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsRegistering(true);
        setRegisterError(null);
        setRegisterSuccess(null);

        const formData = new FormData(e.currentTarget);

        if (selectedDeptId) {
            const match = departments.find(d => d.id === selectedDeptId);
            if (match) {
                formData.set("department", match.name);
                formData.set("departmentId", match.id);
            }
        }

        const res = await createWorkerAccount(formData);
        setIsRegistering(false);

        if (res.error) {
            setRegisterError(res.error);
        } else {
            setRegisterSuccess(`Worker registered successfully! (${res.email})`);
            setTimeout(() => {
                setIsRegisterModalOpen(false);
                setRegisterSuccess(null);
                router.refresh();
            }, 1800);
        }
    };

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
        const timer = setTimeout(() => setIsSearching(false), 0);
        return () => clearTimeout(timer);
    }, [workers]);

    const pushParams = (params: URLSearchParams) => {
        const queryString = params.toString();
        router.push(queryString ? `${pathname}?${queryString}` : pathname);
    };

    const handleDepartmentChange = (departmentId: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (departmentId === 'all') {
            params.delete('department');
        } else {
            params.set('department', departmentId);
        }
        params.set('page', '1');
        pushParams(params);
    };

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages) return;
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', newPage.toString());
        pushParams(params);
    };

    const handleAssignHead = async (worker: Profile) => {
        setError(null);
        setBusyWorkerId(worker.id);
        const result = await assignDepartmentHead(worker.id);

        if (result.error) {
            setError(result.error);
        } else {
            router.refresh();
        }

        setBusyWorkerId(null);
    };

    const handleRemoveHead = async (worker: Profile) => {
        if (!worker.head_department_id) return;

        setError(null);
        setBusyWorkerId(worker.id);
        const result = await removeDepartmentHead(worker.head_department_id);

        if (result.error) {
            setError(result.error);
        } else {
            router.refresh();
        }

        setBusyWorkerId(null);
    };

    const pageStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const pageEnd = Math.min(currentPage * pageSize, totalCount);

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-800 dark:text-white/90">Workers Directory</h1>
                    <p className="text-neutral-500 dark:text-white/50 mt-1">Manage and view all registered profiles ({totalCount} total)</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <div className="relative w-full sm:w-64">
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
                    <div className="relative w-full sm:w-56">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                        <select
                            value={selectedDepartment}
                            onChange={(event) => handleDepartmentChange(event.target.value)}
                            className="w-full appearance-none pl-10 pr-8 py-2.5 bg-white dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-[14px] text-neutral-800 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all shadow-sm"
                        >
                            <option value="all">All departments</option>
                            {departments.map((department) => (
                                <option key={department.id} value={department.id}>
                                    {department.name}{department.is_active ? "" : " (Inactive)"}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => {
                            setIsRegisterModalOpen(true);
                            setRegisterError(null);
                            setRegisterSuccess(null);
                        }}
                        className="flex items-center justify-center gap-2 bg-[#34A853] hover:bg-[#2b8a44] text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm shadow-[#34A853]/20 shrink-0"
                    >
                        <UserPlus className="w-4 h-4" />
                        Add Worker
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-start justify-between gap-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 dark:hover:text-red-300">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

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
                                <th className="px-6 py-4 text-right">Department Head</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 dark:divide-white/10">
                            {workers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-neutral-500 dark:text-white/40 text-[14px]">
                                        No workers found matching your filters.
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
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-[14px] font-medium text-neutral-800 dark:text-white/90 group-hover:text-[#34A853] transition-colors">
                                                                {worker.first_name} {worker.last_name}
                                                            </p>
                                                            {worker.worker_id && (
                                                                <span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 text-[10px] font-mono font-semibold rounded shrink-0">
                                                                    {worker.worker_id}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {worker.head_department_name && (
                                                            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                                                <Crown className="w-3 h-3" />
                                                                Department Head
                                                            </div>
                                                        )}
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
                                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase ${worker.role === 'admin'
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
                                            <td className="px-6 py-4 text-right">
                                                {worker.head_department_id ? (
                                                    <button
                                                        onClick={() => handleRemoveHead(worker)}
                                                        disabled={busyWorkerId === worker.id}
                                                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-500/15 disabled:opacity-50 dark:text-amber-300"
                                                    >
                                                        {busyWorkerId === worker.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />}
                                                        Remove Head
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleAssignHead(worker)}
                                                        disabled={busyWorkerId === worker.id || !worker.department_id}
                                                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-600 hover:border-[#34A853]/30 hover:bg-[#34A853]/10 hover:text-[#34A853] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60"
                                                    >
                                                        {busyWorkerId === worker.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />}
                                                        Make Head
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-t border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02]">
                    <p className="text-[13px] text-neutral-500 dark:text-white/50">
                        Showing <span className="font-semibold text-neutral-700 dark:text-white/80">{pageStart}</span>-<span className="font-semibold text-neutral-700 dark:text-white/80">{pageEnd}</span> of <span className="font-semibold text-neutral-700 dark:text-white/80">{totalCount}</span>
                    </p>
                    <div className="flex items-center gap-3">
                        <p className="text-[13px] text-neutral-500 dark:text-white/50">
                            Page <span className="font-semibold text-neutral-700 dark:text-white/80">{currentPage}</span> of <span className="font-semibold text-neutral-700 dark:text-white/80">{totalPages}</span>
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
                </div>
            </motion.div>
            {/* REGISTER WORKER MODAL */}
            <AnimatePresence>
                {isRegisterModalOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !isRegistering && setIsRegisterModalOpen(false)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                        >
                            <div className="p-6 border-b border-neutral-100 dark:border-white/5 flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                                        <UserPlus className="w-5 h-5 text-[#34A853]" />
                                        Register Worker Account
                                    </h2>
                                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                                        Create worker profile for individuals without smartphones or email access.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsRegisterModalOpen(false)}
                                    disabled={isRegistering}
                                    className="p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleRegisterSubmit} className="p-6 space-y-4">
                                {registerError && (
                                    <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-300">
                                        {registerError}
                                    </div>
                                )}
                                {registerSuccess && (
                                    <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl text-xs text-emerald-600 dark:text-emerald-300 font-medium">
                                        {registerSuccess}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                                            First Name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            name="firstName"
                                            required
                                            placeholder="e.g. Emmanuel"
                                            className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-xl text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#34A853]/50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                                            Last Name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            name="lastName"
                                            required
                                            placeholder="e.g. Adebayo"
                                            className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-xl text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#34A853]/50"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                                            Phone Number (Optional)
                                        </label>
                                        <input
                                            type="tel"
                                            name="phone"
                                            placeholder="e.g. 08012345678"
                                            className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-xl text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#34A853]/50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                                            Department
                                        </label>
                                        <select
                                            name="departmentId"
                                            value={selectedDeptId}
                                            onChange={(e) => setSelectedDeptId(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-xl text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#34A853]/50"
                                        >
                                            <option value="">Select Department</option>
                                            {departments.map((d) => (
                                                <option key={d.id} value={d.id}>
                                                    {d.name}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            type="hidden"
                                            name="department"
                                            value={departments.find((d) => d.id === selectedDeptId)?.name || ""}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                                        Email Address (Optional)
                                    </label>
                                    <input
                                        type="email"
                                        name="email"
                                        placeholder="Leave blank to auto-generate worker identity email"
                                        className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-xl text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#34A853]/50"
                                    />
                                    <p className="text-[11px] text-neutral-400 mt-1">
                                        If left empty, a secure system identity email will be assigned automatically.
                                    </p>
                                </div>

                                {activeSessions.length > 0 && (
                                    <div className="p-4 bg-[#34A853]/5 border border-[#34A853]/20 rounded-xl space-y-2">
                                        <label className="block text-xs font-bold text-[#34A853] uppercase tracking-wider">
                                            Instant Check-In to Active Session
                                        </label>
                                        <select
                                            name="checkInSessionId"
                                            className="w-full px-3 py-2 bg-white dark:bg-black border border-neutral-200 dark:border-white/10 rounded-lg text-xs text-neutral-900 dark:text-white"
                                        >
                                            <option value="">Do not check in right now</option>
                                            {activeSessions.map((session) => (
                                                <option key={session.id} value={session.id}>
                                                    Sign in to: {session.title}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            type="text"
                                            name="checkInNote"
                                            placeholder="Check-in note (e.g. Registered by Admin)"
                                            className="w-full px-3 py-2 bg-white dark:bg-black border border-neutral-200 dark:border-white/10 rounded-lg text-xs text-neutral-900 dark:text-white"
                                        />
                                    </div>
                                )}

                                <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => setIsRegisterModalOpen(false)}
                                        disabled={isRegistering}
                                        className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isRegistering}
                                        className="flex items-center gap-2 bg-[#34A853] hover:bg-[#2b8a44] text-white px-5 py-2 text-sm font-semibold rounded-xl transition-colors shadow-sm disabled:opacity-50"
                                    >
                                        {isRegistering ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Creating Worker...
                                            </>
                                        ) : (
                                            "Register Worker"
                                        )}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
