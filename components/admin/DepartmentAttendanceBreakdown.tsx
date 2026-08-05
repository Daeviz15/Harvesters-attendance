"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, ChevronDown, Search, UserCheck, Clock, Building2 } from "lucide-react";
import Image from "next/image";
import type { MinistryGroup } from "@/app/admin/sessions/actions";

interface DepartmentAttendanceBreakdownProps {
    totalCheckedIn: number;
    ministries: MinistryGroup[];
    sessionTitle?: string;
}

const TEAM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    PROGRAMS: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/20" },
    MINISTRY: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500/20" },
    MATURITY: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20" },
    MEMBERSHIP: { bg: "bg-pink-500/10", text: "text-pink-600 dark:text-pink-400", border: "border-pink-500/20" },
    MISSIONS: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20" },
    "NEXT GEN": { bg: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-500/20" },
    GENERAL: { bg: "bg-neutral-500/10", text: "text-neutral-600 dark:text-neutral-400", border: "border-neutral-500/20" },
};

export default function DepartmentAttendanceBreakdown({
    totalCheckedIn,
    ministries,
    sessionTitle,
}: DepartmentAttendanceBreakdownProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({});

    const toggleDept = (deptKey: string) => {
        setExpandedDepts(prev => ({ ...prev, [deptKey]: !prev[deptKey] }));
    };

    const cleanQuery = searchQuery.trim().toLowerCase();

    const filteredMinistries = ministries
        .map(ministry => {
            const filteredDepts = ministry.departments
                .map(dept => {
                    const matchingWorkers = dept.workers.filter(w => {
                        if (!cleanQuery) return true;
                        const fullName = `${w.firstName} ${w.lastName}`.toLowerCase();
                        const wId = (w.workerId || "").toLowerCase();
                        const deptName = w.department.toLowerCase();
                        return (
                            fullName.includes(cleanQuery) ||
                            wId.includes(cleanQuery) ||
                            deptName.includes(cleanQuery)
                        );
                    });
                    return {
                        ...dept,
                        workers: matchingWorkers,
                        count: matchingWorkers.length,
                    };
                })
                .filter(dept => dept.workers.length > 0 || (cleanQuery === "" && dept.count >= 0));

            const totalTeamCount = filteredDepts.reduce((acc, d) => acc + d.workers.length, 0);

            return {
                ...ministry,
                count: totalTeamCount,
                departments: filteredDepts,
            };
        })
        .filter(m => m.departments.length > 0 && m.count > 0);

    return (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-4 sm:p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 dark:border-white/5 pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-[#34A853]" />
                        <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                            Active Attendance by Department & Ministry
                        </h2>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        {sessionTitle ? `Live Breakdown for: ${sessionTitle}` : "Real-time worker turnout categorized by ministry and department"}
                    </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <span className="px-3 py-1.5 bg-[#34A853]/10 text-[#34A853] text-xs font-bold rounded-xl border border-[#34A853]/20 flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4" />
                        {totalCheckedIn} {totalCheckedIn === 1 ? "Worker" : "Workers"} Active
                    </span>
                </div>
            </div>

            {totalCheckedIn > 0 && (
                <div className="relative">
                    <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Filter checked-in workers by name, department, or Worker ID (HRV-XXXX)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 text-xs sm:text-sm text-neutral-900 dark:text-white"
                    />
                </div>
            )}

            {totalCheckedIn === 0 ? (
                <div className="p-8 text-center bg-neutral-50 dark:bg-neutral-900/30 rounded-2xl border border-dashed border-neutral-200 dark:border-white/10">
                    <Building2 className="w-10 h-10 text-neutral-400 mx-auto mb-3 opacity-50" />
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        No workers are currently signed in for this session.
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm mx-auto">
                        When workers check in via GPS or Proxy Sign-In, their department breakdown will appear here in real time.
                    </p>
                </div>
            ) : filteredMinistries.length === 0 ? (
                <div className="p-8 text-center bg-neutral-50 dark:bg-neutral-900/30 rounded-2xl border border-dashed border-neutral-200 dark:border-white/10">
                    <Search className="w-8 h-8 text-neutral-400 mx-auto mb-2 opacity-50" />
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                        No checked-in workers match &quot;{searchQuery}&quot;
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    {filteredMinistries.map(ministry => {
                        const style = TEAM_COLORS[ministry.team] || TEAM_COLORS.GENERAL;

                        return (
                            <div key={ministry.team} className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${style.bg} ${style.text} ${style.border}`}>
                                            {ministry.team} MINISTRY
                                        </span>
                                        <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                                            ({ministry.count} {ministry.count === 1 ? "worker" : "workers"})
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {ministry.departments.map(dept => {
                                        const deptKey = `${ministry.team}:${dept.department}`;
                                        const isExpanded = expandedDepts[deptKey] !== false;

                                        return (
                                            <div
                                                key={deptKey}
                                                className="bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/80 dark:border-white/5 rounded-xl overflow-hidden transition-all"
                                            >
                                                <button
                                                    onClick={() => toggleDept(deptKey)}
                                                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-neutral-100/50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <Building2 className="w-4 h-4 text-[#34A853] shrink-0" />
                                                        <span className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                                                            {dept.department}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="px-2.5 py-0.5 bg-[#34A853]/10 text-[#34A853] text-xs font-bold rounded-lg">
                                                            {dept.count}
                                                        </span>
                                                        <ChevronDown
                                                            className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${
                                                                isExpanded ? "rotate-180" : "rotate-0"
                                                            }`}
                                                        />
                                                    </div>
                                                </button>

                                                <AnimatePresence initial={false}>
                                                    {isExpanded && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: "auto", opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.2 }}
                                                            className="border-t border-neutral-100 dark:border-white/5 p-3 space-y-2 max-h-60 overflow-y-auto"
                                                        >
                                                            {dept.workers.map(worker => (
                                                                <div
                                                                    key={worker.id}
                                                                    className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-white/5 text-xs"
                                                                >
                                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                                        {worker.avatarUrl ? (
                                                                            <Image
                                                                                src={worker.avatarUrl}
                                                                                alt=""
                                                                                width={32}
                                                                                height={32}
                                                                                unoptimized
                                                                                className="rounded-full object-cover shrink-0"
                                                                            />
                                                                        ) : (
                                                                            <div className="w-8 h-8 rounded-full bg-[#34A853]/10 text-[#34A853] font-bold text-xs flex items-center justify-center shrink-0">
                                                                                {worker.firstName[0]}{worker.lastName[0] || ""}
                                                                            </div>
                                                                        )}
                                                                        <div className="min-w-0">
                                                                            <div className="flex items-center gap-1.5">
                                                                                <p className="font-semibold text-neutral-900 dark:text-white truncate">
                                                                                    {worker.firstName} {worker.lastName}
                                                                                </p>
                                                                                {worker.workerId && (
                                                                                    <span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 text-[10px] font-mono font-semibold rounded shrink-0">
                                                                                        {worker.workerId}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex items-center gap-2 text-[10px] text-neutral-400 mt-0.5">
                                                                                <span className="flex items-center gap-1">
                                                                                    <Clock className="w-3 h-3" />
                                                                                    {new Date(worker.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                                </span>
                                                                                {worker.isManual && (
                                                                                    <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded font-medium">
                                                                                        Proxy: {worker.checkInNote || "Manual"}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
