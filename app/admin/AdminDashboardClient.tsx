"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Users, Activity, Calendar, UserPlus, Zap,
    X, Loader2, Building2, Search, User, Check,
    ClipboardCheck
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { createWorkerAccount } from "@/app/admin/workers/actions";
import { searchWorkersForCheckIn, manualWorkerCheckIn } from "@/app/admin/sessions/actions";

import DepartmentAttendanceBreakdown from "@/components/admin/DepartmentAttendanceBreakdown";
import type { MinistryGroup } from "./sessions/actions";

interface DepartmentOption {
    id: string;
    name: string;
    is_active: boolean;
}

interface ActiveSessionOption {
    id: string;
    title: string;
}

interface SearchWorkerResult {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    department: string | null;
    avatar_url: string | null;
    role: string;
    worker_id: string | null;
    isCheckedIn: boolean;
}

interface AdminDashboardClientProps {
    workerCount: number;
    activeSessionsCount: number;
    totalEventsCount: number;
    departments: DepartmentOption[];
    activeSessions: ActiveSessionOption[];
    initialBreakdown?: {
        totalCheckedIn: number;
        ministries: MinistryGroup[];
    };
}

const REASON_CHIPS = [
    { label: "Sent on Errand", value: "Sent on Errand" },
    { label: "Official Permission", value: "Official Permission" },
    { label: "No Smartphone / Manual", value: "No Smartphone / Manual" },
    { label: "Guest / Special Service", value: "Guest / Special Service" },
];

export default function AdminDashboardClient({
    workerCount,
    activeSessionsCount,
    totalEventsCount,
    departments,
    activeSessions,
    initialBreakdown,
}: AdminDashboardClientProps) {
    const router = useRouter();

    
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [registerError, setRegisterError] = useState<string | null>(null);
    const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);
    const [selectedDeptId, setSelectedDeptId] = useState<string>("");

    
    const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
    const [selectedSessionId, setSelectedSessionId] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchWorkerResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isCheckingIn, setIsCheckingIn] = useState<string | null>(null);
    const [checkInError, setCheckInError] = useState<string | null>(null);
    const [checkInSuccess, setCheckInSuccess] = useState<string | null>(null);
    const [checkInNote, setCheckInNote] = useState("");

    
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
            const wid = (res as any).workerId || "";
            setRegisterSuccess(`Worker registered! ID: ${wid}`);
            setTimeout(() => {
                setIsRegisterModalOpen(false);
                setRegisterSuccess(null);
                router.refresh();
            }, 2000);
        }
    };

    // ---- Search Workers for Check-In ----
    const handleSearchWorkers = useCallback(async (query: string, sessionId: string) => {
        if (!sessionId) return;
        setIsSearching(true);
        const res = await searchWorkersForCheckIn(query, sessionId);
        setIsSearching(false);
        if (res.data) {
            setSearchResults(res.data as SearchWorkerResult[]);
        }
    }, []);

    useEffect(() => {
        if (!isCheckInModalOpen || !selectedSessionId) return;
        // Fetch immediately for empty query, 300ms debounce for typed queries
        const delay = searchQuery.length === 0 ? 0 : 300;
        const timer = setTimeout(() => {
            handleSearchWorkers(searchQuery, selectedSessionId);
        }, delay);
        return () => clearTimeout(timer);
    }, [searchQuery, selectedSessionId, isCheckInModalOpen, handleSearchWorkers]);

    // ---- Manual Check-In Handler ----
    const handleManualCheckIn = async (workerId: string) => {
        if (!selectedSessionId) return;
        setIsCheckingIn(workerId);
        setCheckInError(null);
        setCheckInSuccess(null);

        const res = await manualWorkerCheckIn({
            workerId,
            sessionId: selectedSessionId,
            note: checkInNote || undefined,
        });

        setIsCheckingIn(null);

        if (res.error) {
            setCheckInError(res.error);
        } else {
            setCheckInSuccess("Worker checked in successfully!");
            // Refresh search results to update isCheckedIn state
            handleSearchWorkers(searchQuery, selectedSessionId);
            setTimeout(() => setCheckInSuccess(null), 2000);
        }
    };

    // ---- Reset modals on close ----
    const closeRegisterModal = () => {
        setIsRegisterModalOpen(false);
        setRegisterError(null);
        setRegisterSuccess(null);
        setSelectedDeptId("");
    };

    const closeCheckInModal = () => {
        setIsCheckInModalOpen(false);
        setSearchQuery("");
        setSearchResults([]);
        setCheckInError(null);
        setCheckInSuccess(null);
        setCheckInNote("");
        setSelectedSessionId("");
    };

    return (
        <div className="space-y-8">
            {/* Header + Quick Actions */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white mb-2">
                        Dashboard Overview
                    </h1>
                    <p className="text-neutral-500 dark:text-neutral-400">
                        Welcome to the Harvesters Attendance Admin Portal.
                    </p>
                </div>

                {/* Quick Action Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsRegisterModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-[#34A853] hover:bg-[#2e9347] text-white rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow-md"
                    >
                        <UserPlus className="w-4 h-4" />
                        Add Worker
                    </button>
                    <button
                        onClick={() => {
                            if (activeSessions.length === 0) {
                                setCheckInError("No active sessions. Start a session first.");
                                setTimeout(() => setCheckInError(null), 3000);
                                return;
                            }
                            if (activeSessions.length === 1) {
                                setSelectedSessionId(activeSessions[0].id);
                            }
                            setIsCheckInModalOpen(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow-md"
                    >
                        <Zap className="w-4 h-4" />
                        Sign In Worker
                    </button>
                </div>
            </div>

            {/* Inline error for no active sessions */}
            <AnimatePresence>
                {checkInError && !isCheckInModalOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm p-3 rounded-xl"
                    >
                        {checkInError}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-neutral-700 dark:text-neutral-300">Active Sessions</h3>
                        <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                            <Activity className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-4xl font-bold text-neutral-900 dark:text-white">
                        {activeSessionsCount}
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
                        {workerCount}
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
                        {totalEventsCount}
                    </p>
                    <div className="mt-4">
                        <Link href="/admin/events" className="text-sm font-medium text-[#34A853] hover:underline">
                            Manage events →
                        </Link>
                    </div>
                </div>
            </div>

            {/* Department & Ministry Attendance Breakdown Widget */}
            <DepartmentAttendanceBreakdown
                totalCheckedIn={initialBreakdown?.totalCheckedIn || 0}
                ministries={initialBreakdown?.ministries || []}
                sessionTitle={activeSessions[0]?.title}
            />

            {/* ===== REGISTER WORKER MODAL ===== */}
            <AnimatePresence>
                {isRegisterModalOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeRegisterModal}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] sm:w-full max-w-lg max-h-[90vh] bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden"
                        >
                            <div className="p-4 sm:p-6 border-b border-neutral-100 dark:border-white/5 flex items-center justify-between shrink-0">
                                <h2 className="text-base sm:text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                                    <UserPlus className="w-5 h-5 text-[#34A853] shrink-0" />
                                    Register Worker Account
                                </h2>
                                <button onClick={closeRegisterModal} className="p-1.5 sm:p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors shrink-0">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <form onSubmit={handleRegisterSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
                                <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 -mt-1 mb-2">
                                    Create a worker profile for individuals without smartphones or email access. A unique Worker ID (HRV-XXXX) will be auto-assigned.
                                </p>

                                {registerError && (
                                    <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs sm:text-sm p-3 rounded-xl">
                                        {registerError}
                                    </div>
                                )}
                                {registerSuccess && (
                                    <div className="bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-xs sm:text-sm p-3 rounded-xl flex items-center gap-2">
                                        <Check className="w-4 h-4" />
                                        {registerSuccess}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                    <div>
                                        <label className="block text-xs sm:text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                            First Name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text" name="firstName" required minLength={2}
                                            className="w-full px-3 py-2.5 border border-neutral-200 dark:border-white/10 rounded-xl bg-neutral-50 dark:bg-white/5 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#34A853]/30 focus:border-[#34A853]"
                                            placeholder="e.g. Emmanuel"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs sm:text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                            Last Name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text" name="lastName" required minLength={2}
                                            className="w-full px-3 py-2.5 border border-neutral-200 dark:border-white/10 rounded-xl bg-neutral-50 dark:bg-white/5 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#34A853]/30 focus:border-[#34A853]"
                                            placeholder="e.g. Adebayo"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                    <div>
                                        <label className="block text-xs sm:text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                            Phone Number (Optional)
                                        </label>
                                        <input
                                            type="tel" name="phone"
                                            className="w-full px-3 py-2.5 border border-neutral-200 dark:border-white/10 rounded-xl bg-neutral-50 dark:bg-white/5 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#34A853]/30 focus:border-[#34A853]"
                                            placeholder="e.g. 08012345678"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs sm:text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                            Department
                                        </label>
                                        <select
                                            value={selectedDeptId}
                                            onChange={(e) => setSelectedDeptId(e.target.value)}
                                            className="w-full px-3 py-2.5 border border-neutral-200 dark:border-white/10 rounded-xl bg-neutral-50 dark:bg-white/5 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#34A853]/30 focus:border-[#34A853]"
                                        >
                                            <option value="">Select Department</option>
                                            {departments.filter(d => d.is_active).map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs sm:text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                        Email Address (Optional)
                                    </label>
                                    <input
                                        type="email" name="email"
                                        className="w-full px-3 py-2.5 border border-neutral-200 dark:border-white/10 rounded-xl bg-neutral-50 dark:bg-white/5 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#34A853]/30 focus:border-[#34A853]"
                                        placeholder="Leave blank for auto identity email"
                                    />
                                    <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                                        If left empty, a secure system identity email will be assigned automatically.
                                    </p>
                                </div>

                                {/* Instant Check-In to Active Session */}
                                {activeSessions.length > 0 && (
                                    <div>
                                        <label className="block text-xs sm:text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                            Instant Check-In to Session (Optional)
                                        </label>
                                        <select
                                            name="checkInSessionId"
                                            className="w-full px-3 py-2.5 border border-neutral-200 dark:border-white/10 rounded-xl bg-neutral-50 dark:bg-white/5 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#34A853]/30 focus:border-[#34A853]"
                                        >
                                            <option value="">Don&apos;t check in now</option>
                                            {activeSessions.map(s => (
                                                <option key={s.id} value={s.id}>{s.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="flex flex-col-reverse sm:flex-row items-center gap-2 sm:gap-3 pt-2">
                                    <button type="button" onClick={closeRegisterModal} className="w-full sm:flex-1 py-2.5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-white/70 hover:bg-neutral-50 dark:hover:bg-white/5 rounded-xl font-medium transition-colors text-sm">
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isRegistering}
                                        className="w-full sm:flex-1 py-2.5 bg-[#34A853] hover:bg-[#2e9347] text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                    >
                                        {isRegistering ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                        Register Worker
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ===== SIGN IN WORKER MODAL ===== */}
            <AnimatePresence>
                {isCheckInModalOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeCheckInModal}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-[85vh] flex flex-col"
                        >
                            <div className="p-6 border-b border-neutral-100 dark:border-white/5 flex items-center justify-between shrink-0">
                                <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                                    <ClipboardCheck className="w-5 h-5 text-blue-500" />
                                    Sign In Worker
                                </h2>
                                <button onClick={closeCheckInModal} className="p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4 overflow-y-auto flex-1">
                                {/* Session Selector (if multiple active sessions) */}
                                {activeSessions.length > 1 && (
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                            Select Session <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            value={selectedSessionId}
                                            onChange={(e) => setSelectedSessionId(e.target.value)}
                                            className="w-full px-3 py-2.5 border border-neutral-200 dark:border-white/10 rounded-xl bg-neutral-50 dark:bg-white/5 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                                        >
                                            <option value="">Choose a session...</option>
                                            {activeSessions.map(s => (
                                                <option key={s.id} value={s.id}>{s.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Check-In Reason */}
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                                        Reason (Optional)
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {REASON_CHIPS.map(chip => (
                                            <button
                                                key={chip.value}
                                                type="button"
                                                onClick={() => setCheckInNote(checkInNote === chip.value ? "" : chip.value)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                                    checkInNote === chip.value
                                                        ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                                                        : "bg-neutral-50 dark:bg-white/5 border-neutral-200 dark:border-white/10 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-white/20"
                                                }`}
                                            >
                                                {chip.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Worker Search */}
                                {selectedSessionId && (
                                    <>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                placeholder="Search by name, email, phone, or department..."
                                                className="w-full pl-9 pr-4 py-2.5 border border-neutral-200 dark:border-white/10 rounded-xl bg-neutral-50 dark:bg-white/5 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                                            />
                                            {isSearching && (
                                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 animate-spin" />
                                            )}
                                        </div>

                                        {/* Status Messages */}
                                        {checkInError && isCheckInModalOpen && (
                                            <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm p-3 rounded-xl">
                                                {checkInError}
                                            </div>
                                        )}
                                        {checkInSuccess && (
                                            <div className="bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-sm p-3 rounded-xl flex items-center gap-2">
                                                <Check className="w-4 h-4" />
                                                {checkInSuccess}
                                            </div>
                                        )}

                                        {/* Search Results */}
                                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                            {searchResults.length === 0 && !isSearching && searchQuery.length > 0 ? (
                                                <div className="p-6 text-center bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-dashed border-neutral-200 dark:border-white/10">
                                                    <User className="w-8 h-8 text-neutral-400 mx-auto mb-2 opacity-50" />
                                                    <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                                                        No workers found matching &quot;{searchQuery}&quot;
                                                    </p>
                                                </div>
                                            ) : (
                                                searchResults.map(worker => (
                                                    <div
                                                        key={worker.id}
                                                        className="flex items-center justify-between p-3 rounded-xl border border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            {worker.avatar_url ? (
                                                                <Image src={worker.avatar_url} alt="" width={36} height={36} className="rounded-full object-cover" />
                                                            ) : (
                                                                <div className="w-9 h-9 rounded-full bg-neutral-200 dark:bg-white/10 flex items-center justify-center">
                                                                    <User className="w-4 h-4 text-neutral-500" />
                                                                </div>
                                                            )}
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                                                                        {worker.first_name} {worker.last_name}
                                                                    </p>
                                                                    {worker.worker_id && (
                                                                        <span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 text-[10px] font-mono font-semibold rounded shrink-0">
                                                                            {worker.worker_id}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                                                                    {worker.department || "No department"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {worker.isCheckedIn ? (
                                                            <span className="flex items-center gap-1 px-2.5 py-1 bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-semibold rounded-lg shrink-0">
                                                                <Check className="w-3 h-3" />
                                                                Checked In
                                                            </span>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleManualCheckIn(worker.id)}
                                                                disabled={isCheckingIn === worker.id}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                                            >
                                                                {isCheckingIn === worker.id ? (
                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                ) : (
                                                                    <Zap className="w-3 h-3" />
                                                                )}
                                                                Sign In
                                                            </button>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* Prompt to select session */}
                                {!selectedSessionId && activeSessions.length > 1 && (
                                    <div className="p-6 text-center bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-dashed border-neutral-200 dark:border-white/10">
                                        <Activity className="w-8 h-8 text-neutral-400 mx-auto mb-2 opacity-50" />
                                        <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                                            Please select a session above to search workers.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
