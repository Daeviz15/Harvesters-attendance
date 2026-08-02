"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
    Search, ChevronLeft, ChevronRight, ChevronDown, Download, RotateCcw,
    CheckCircle2, Clock, Users, Building2, AlertTriangle, Star,
    CalendarDays, MapPin,
} from "lucide-react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer,
} from "recharts";
import ExportModal from "@/components/admin/ExportModal";
import type { ReportLog, ReportsPayload } from "./actions";

// ── Props ──────────────────────────────────────────────────────────────────────

interface ReportsClientProps {
    logs: ReportLog[];
    departments: string[];
    events: string[];
    latestSession: ReportsPayload["latestSession"];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type SortKey = "worker" | "department" | "event" | "date" | "checkIn";
type SortDir = "asc" | "desc";
type GroupBy = "none" | "date" | "week" | "event" | "worker" | "department";

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseDate(dStr: string) {
    const [y, m, d] = dStr.split("-").map(Number);
    return new Date(y, m - 1, d);
}
function fmtDateShort(dStr: string) {
    const d = parseDate(dStr);
    return MONTHS[d.getMonth()] + " " + d.getDate();
}
function fmtDateFull(dStr: string) {
    const d = parseDate(dStr);
    return WEEKDAYS[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
}
function fmtTime(iso: string) {
    const d = new Date(iso);
    let h = d.getHours();
    const m = d.getMinutes();
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return h + ":" + String(m).padStart(2, "0") + " " + ap;
}
function fmtDuration(mins: number) {
    mins = Math.max(0, Math.round(mins));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? h + "h " + String(m).padStart(2, "0") + "m" : m + "m";
}
function weekKey(dStr: string) {
    const d = parseDate(dStr);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diff);
    return mon.toISOString().slice(0, 10);
}
function weekLabel(mondayKey: string) {
    const mon = parseDate(mondayKey);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return fmtDateShort(mondayKey) + " – " + fmtDateShort(sun.toISOString().slice(0, 10));
}
function initials(name: string) {
    return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}
function offsetClass(mins: number) {
    if (mins <= 0) return "text-[#237539] dark:text-[#7be3a0]";
    if (mins <= 10) return "text-neutral-500 dark:text-white/45";
    if (mins <= 25) return "text-amber-600 dark:text-amber-300";
    return "text-red-600 dark:text-red-400";
}
function offsetLabel(mins: number) {
    if (mins <= 0) return Math.abs(mins) + "m early";
    if (mins <= 10) return "On time";
    return mins + "m late";
}
function avgOffsetSentence(group: ReportLog[]) {
    const avg = Math.round(group.reduce((s, r) => s + r.offsetMin, 0) / group.length);
    if (avg <= 0) return "avg " + Math.abs(avg) + "m early";
    if (avg <= 10) return "avg on time";
    return "avg " + avg + "m late";
}

// ── CSV Export ─────────────────────────────────────────────────────────────────

function escapeCSV(v: string | number) {
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportCSV(filtered: ReportLog[]) {
    const header = ["Worker", "Department", "Event", "Date", "Check-in", "Check-out", "Duration (min)", "Arrival offset (min)", "Status", "Method"];
    const rows = filtered.map((r) => [
        r.workerName, r.department, r.eventTitle, r.date,
        fmtTime(r.checkInTime),
        r.checkOutTime ? fmtTime(r.checkOutTime) : "—",
        r.checkOutTime ? Math.round((new Date(r.checkOutTime).getTime() - new Date(r.checkInTime).getTime()) / 60000) : 0,
        r.offsetMin,
        r.status === "completed" ? "Completed" : r.status === "auto_completed" ? "Auto-completed" : "Active",
        r.isManual ? "Proxy" : "GPS",
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCSV).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── Subcomponents ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    if (status === "completed") {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wide bg-[#34A853]/10 text-[#237539] dark:text-[#7be3a0] border border-[#34A853]/25">
                <CheckCircle2 className="w-3 h-3" />Completed
            </span>
        );
    }
    if (status === "auto_completed") {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wide bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                <Clock className="w-3 h-3" />Auto-completed
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wide bg-[#34A853]/10 text-[#34A853] border border-[#34A853]/20 animate-pulse">
            <Clock className="w-3 h-3" />Active
        </span>
    );
}

function AvatarChip({ name, url }: { name: string; url: string | null }) {
    return (
        <div className="w-9 h-9 rounded-full bg-[#34A853]/10 border border-[#34A853]/20 flex items-center justify-center text-[11px] font-bold text-[#34A853] overflow-hidden relative shrink-0">
            {url ? (
                <Image src={url} alt={name} fill className="object-cover" sizes="36px" />
            ) : (
                initials(name)
            )}
        </div>
    );
}

function MethodTag({ isManual }: { isManual: boolean }) {
    return isManual ? (
        <span className="inline-flex items-center gap-1 text-[10.5px] text-neutral-400 dark:text-white/35">Proxy</span>
    ) : (
        <span className="inline-flex items-center gap-1 text-[10.5px] text-neutral-400 dark:text-white/35">
            <MapPin className="w-3 h-3" />GPS
        </span>
    );
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon }: {
    label: string;
    value: string | number;
    sub: string;
    icon: React.ComponentType<{ className?: string }>;
}) {
    return (
        <div className="bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl p-5 shadow-sm flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-neutral-500 dark:text-white/45 uppercase tracking-wide">{label}</p>
                <Icon className="w-4 h-4 text-[#34A853]" />
            </div>
            <div>
                <p className="text-2xl md:text-3xl font-bold text-neutral-800 dark:text-white/90 font-mono">{value}</p>
                <p className="text-[12px] text-neutral-400 dark:text-white/35 mt-0.5">{sub}</p>
            </div>
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ReportsClient({ logs, departments, events, latestSession }: ReportsClientProps) {
    // ── State ──────────────────────────────────────────────────────────────
    const [search, setSearch] = useState("");
    const [department, setDepartment] = useState("all");
    const [event, setEvent] = useState("all");
    const [status, setStatus] = useState("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [groupBy, setGroupBy] = useState<GroupBy>("date");
    const [sortKey, setSortKey] = useState<SortKey>("checkIn");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const [page, setPage] = useState(1);
    const [activeRange, setActiveRange] = useState("all");
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

    // Reset open groups whenever filters or grouping mode changes (closed by default)
    useEffect(() => {
        setOpenGroups(new Set());
    }, [groupBy, search, department, event, status, dateFrom, dateTo]);

    // ── Filtering ──────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return logs.filter((r) => {
            if (q && !(r.workerName.toLowerCase().includes(q) || r.department.toLowerCase().includes(q) || r.eventTitle.toLowerCase().includes(q))) return false;
            if (department !== "all" && r.department !== department) return false;
            if (event !== "all" && r.eventTitle !== event) return false;
            if (status !== "all" && r.status !== status) return false;
            if (dateFrom && r.date < dateFrom) return false;
            if (dateTo && r.date > dateTo) return false;
            return true;
        });
    }, [logs, search, department, event, status, dateFrom, dateTo]);

    // ── Sorting ────────────────────────────────────────────────────────────
    const sorted = useMemo(() => {
        const dir = sortDir === "asc" ? 1 : -1;
        return [...filtered].sort((a, b) => {
            let av: string | number, bv: string | number;
            switch (sortKey) {
                case "worker": av = a.workerName; bv = b.workerName; break;
                case "department": av = a.department; bv = b.department; break;
                case "event": av = a.eventTitle; bv = b.eventTitle; break;
                case "date": av = a.date; bv = b.date; break;
                default: av = a.checkInTime; bv = b.checkInTime;
            }
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        });
    }, [filtered, sortKey, sortDir]);

    // ── Stats ──────────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const totalCheckIns = filtered.length;
        const uniqueWorkers = new Set(filtered.map((r) => r.workerName)).size;
        const uniqueDepartments = new Set(filtered.map((r) => r.department)).size;
        const autoClosed = filtered.filter((r) => r.status === "auto_completed").length;
        return { totalCheckIns, uniqueWorkers, uniqueDepartments, autoClosed };
    }, [filtered]);

    // ── Chart Data ─────────────────────────────────────────────────────────
    const trendData = useMemo(() => {
        const map = new Map<string, number>();
        filtered.forEach((r) => map.set(r.date, (map.get(r.date) || 0) + 1));
        return [...map.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, count]) => ({ date: fmtDateShort(date), count }));
    }, [filtered]);

    const deptData = useMemo(() => {
        const map = new Map<string, number>();
        filtered.forEach((r) => map.set(r.department, (map.get(r.department) || 0) + 1));
        return [...map.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([dept, count]) => ({ dept, count }));
    }, [filtered]);

    // ── Pagination ─────────────────────────────────────────────────────────
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageStart = (safePage - 1) * PAGE_SIZE;
    const pageItems = sorted.slice(pageStart, pageStart + PAGE_SIZE);

    // ── Grouping ───────────────────────────────────────────────────────────
    const grouped = useMemo(() => {
        if (groupBy === "none") return null;
        const map = new Map<string, ReportLog[]>();
        filtered.forEach((r) => {
            let k: string;
            switch (groupBy) {
                case "date": k = r.date; break;
                case "week": k = weekKey(r.date); break;
                case "event": k = r.eventTitle; break;
                case "worker": k = r.workerName; break;
                case "department": k = r.department; break;
                default: k = r.date;
            }
            if (!map.has(k)) map.set(k, []);
            map.get(k)!.push(r);
        });

        let entries = [...map.entries()];
        if (groupBy === "date" || groupBy === "week") {
            entries.sort((a, b) => b[0].localeCompare(a[0]));
        } else {
            entries.sort((a, b) => b[1].length - a[1].length);
        }
        return entries;
    }, [filtered, groupBy]);

    // ── Handlers ───────────────────────────────────────────────────────────
    const handleSort = useCallback((key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("desc");
        }
    }, [sortKey]);

    const handleRangeClick = useCallback((range: string) => {
        setActiveRange(range);
        if (range === "all") {
            setDateFrom("");
            setDateTo("");
        } else {
            const days = parseInt(range, 10);
            const today = new Date();
            const from = new Date(today);
            from.setDate(today.getDate() - (days - 1));
            setDateFrom(from.toISOString().slice(0, 10));
            setDateTo(today.toISOString().slice(0, 10));
        }
        setPage(1);
    }, []);

    const handleReset = useCallback(() => {
        setSearch("");
        setDepartment("all");
        setEvent("all");
        setStatus("all");
        setDateFrom("");
        setDateTo("");
        setActiveRange("all");
        setGroupBy("date");
        setSortKey("checkIn");
        setSortDir("desc");
        setPage(1);
    }, []);

    const toggleGroup = useCallback((key: string) => {
        setOpenGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    const handleJumpToLatest = useCallback(() => {
        if (latestSession) {
            setDateFrom(latestSession.date);
            setDateTo(latestSession.date);
            setActiveRange("custom");
            setPage(1);
        }
    }, [latestSession]);

    // ── Group rendering helpers ────────────────────────────────────────────
    function groupHeader(key: string, rows: ReportLog[]) {
        const uniqueWorkers = new Set(rows.map((r) => r.workerName)).size;
        const uniqueDepts = new Set(rows.map((r) => r.department)).size;

        switch (groupBy) {
            case "date":
                return {
                    eyebrow: rows[0].eventTitle,
                    title: fmtDateFull(key),
                    meta: `${rows.length} check-ins · ${uniqueWorkers} workers · ${uniqueDepts} departments · ${avgOffsetSentence(rows)}`,
                    hideCol: "date" as const,
                };
            case "week": {
                const uniqueSessions = new Set(rows.map((r) => r.date + "|" + r.eventTitle)).size;
                return {
                    eyebrow: "Weekly summary",
                    title: "Week of " + weekLabel(key),
                    meta: `${rows.length} check-ins across ${uniqueSessions} session${uniqueSessions !== 1 ? "s" : ""} · ${uniqueWorkers} workers · ${avgOffsetSentence(rows)}`,
                    hideCol: null,
                };
            }
            case "event": {
                const occurrences = new Set(rows.map((r) => r.date)).size;
                return {
                    eyebrow: "Event",
                    title: key,
                    meta: `${rows.length} check-ins across ${occurrences} occurrence${occurrences !== 1 ? "s" : ""} · ${uniqueWorkers} unique workers · ${avgOffsetSentence(rows)}`,
                    hideCol: "event" as const,
                };
            }
            case "worker": {
                const dept = rows[0].department;
                const scopeSessions = new Set(filtered.map((r) => r.date + "|" + r.eventTitle)).size || 1;
                const rate = Math.min(100, Math.round((rows.length / scopeSessions) * 100));
                return {
                    eyebrow: dept,
                    title: key,
                    meta: `Attended ${rows.length} of ${scopeSessions} sessions in view (${rate}%) · ${avgOffsetSentence(rows)}`,
                    hideCol: "worker" as const,
                };
            }
            case "department": {
                return {
                    eyebrow: "Department",
                    title: key,
                    meta: `${uniqueWorkers} members logged · ${rows.length} check-ins · ${avgOffsetSentence(rows)}`,
                    hideCol: "department" as const,
                };
            }
            default:
                return { eyebrow: "", title: key, meta: "", hideCol: null };
        }
    }

    const groupLabels: Record<GroupBy, string> = {
        none: "Flat list",
        date: "Grouped by date",
        week: "Grouped by week",
        event: "Grouped by event",
        worker: "Grouped by worker",
        department: "Grouped by department",
    };

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="w-full max-w-[1400px] mx-auto space-y-6">

            <motion.header
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
                <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-400 dark:text-white/35 uppercase tracking-wider mb-1.5">
                        <span>Admin</span><span>/</span><span>History</span><span>/</span><span className="text-[#34A853]">Reports</span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-800 dark:text-white/90">Attendance Reports</h1>
                    <p className="text-neutral-500 dark:text-white/50 mt-1 text-[13px] md:text-sm">Slice check-ins by date, week, event, worker or department — instead of one long list.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={() => exportCSV(sorted)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#111111] border border-neutral-200 dark:border-white/10 rounded-xl text-[13px] font-semibold text-neutral-700 dark:text-white/80 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors shadow-sm"
                    >
                        <Download className="w-4 h-4 text-[#34A853]" />
                        <span className="hidden sm:inline">Export CSV</span>
                    </button>
                    <button
                        onClick={() => setIsExportModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-[#34A853] text-white rounded-xl text-[13px] font-semibold hover:bg-[#2c9147] transition-colors shadow-sm"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Advanced Export</span>
                    </button>
                </div>
            </motion.header>
            {/* ═══ Stat Cards ═══ */}
            <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4"
            >
                <StatCard label="Total check-ins" value={stats.totalCheckIns} sub="in current filter" icon={CheckCircle2} />
                <StatCard label="Unique workers" value={stats.uniqueWorkers} sub={`of ${new Set(logs.map((l) => l.workerName)).size} total`} icon={Users} />
                <StatCard label="Departments active" value={stats.uniqueDepartments} sub={`of ${departments.length} total`} icon={Building2} />
                <StatCard
                    label="Auto-completed"
                    value={stats.autoClosed}
                    sub={stats.totalCheckIns ? Math.round((stats.autoClosed / stats.totalCheckIns) * 100) + "% forgot to check out" : "no data"}
                    icon={AlertTriangle}
                />
            </motion.section>
            {/* ═══ Header ═══ */}


            {/* ═══ Filters ═══ */}
            <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 }}
                className="bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl p-4 md:p-5 shadow-sm space-y-4"
            >
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute inset-y-0 left-3 my-auto w-4 h-4 text-neutral-400 pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            placeholder="Search worker, department or event…"
                            className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-[13.5px] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all"
                        />
                    </div>
                    <select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} className="w-44 px-3 py-2.5 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[#34A853]/50">
                        <option value="all">All departments</option>
                        {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select value={event} onChange={(e) => { setEvent(e.target.value); setPage(1); }} className="w-44 px-3 py-2.5 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[#34A853]/50">
                        <option value="all">All events</option>
                        {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                    </select>
                    <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-48 px-3 py-2.5 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[#34A853]/50">
                        <option value="all">All check-out types</option>
                        <option value="completed">Manually completed</option>
                        <option value="auto_completed">Auto-completed</option>
                    </select>
                </div>

                <div className="flex flex-wrap gap-3 items-center pt-3 border-t border-neutral-100 dark:border-white/5">
                    <div className="flex items-center gap-2">
                        <label className="text-[11px] font-semibold text-neutral-400 dark:text-white/35 uppercase tracking-wide">From</label>
                        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setActiveRange("custom"); setPage(1); }} className="px-3 py-2 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-[#34A853]/50" />
                        <label className="text-[11px] font-semibold text-neutral-400 dark:text-white/35 uppercase tracking-wide">To</label>
                        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setActiveRange("custom"); setPage(1); }} className="px-3 py-2 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-[#34A853]/50" />
                    </div>

                    <div className="flex items-center gap-1.5">
                        {[
                            { label: "All time", value: "all" },
                            { label: "Last 7 days", value: "7" },
                            { label: "Last 30 days", value: "30" },
                        ].map((btn) => (
                            <button
                                key={btn.value}
                                onClick={() => handleRangeClick(btn.value)}
                                className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg border transition-all whitespace-nowrap ${activeRange === btn.value
                                        ? "bg-[#34A853] border-[#34A853] text-white"
                                        : "border-neutral-200 dark:border-white/10 text-neutral-500 dark:text-white/55 hover:bg-[#34A853]/10 hover:text-[#237539] hover:border-[#34A853]/30 dark:hover:text-[#cff5de]"
                                    }`}
                            >
                                {btn.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 min-w-[8px]" />

                    <div className="flex items-center gap-2">
                        <label className="text-[11px] font-semibold text-neutral-400 dark:text-white/35 uppercase tracking-wide">Group by</label>
                        <select value={groupBy} onChange={(e) => { setGroupBy(e.target.value as GroupBy); setOpenGroups(new Set()); }} className="px-3 py-2 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-[13px] font-semibold text-[#34A853] focus:outline-none focus:ring-2 focus:ring-[#34A853]/50">
                            <option value="none">Flat list</option>
                            <option value="date">Date</option>
                            <option value="week">Week</option>
                            <option value="event">Event</option>
                            <option value="worker">Worker</option>
                            <option value="department">Department</option>
                        </select>
                    </div>
                    <button onClick={handleReset} className="px-3.5 py-2 rounded-xl text-[13px] font-semibold text-neutral-500 dark:text-white/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        <RotateCcw className="w-3.5 h-3.5 inline mr-1" />Reset
                    </button>
                </div>
            </motion.section>



            {/* ═══ Latest Session Banner ═══ */}
            {latestSession && (
                <motion.section
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.09 }}
                >
                    <div className="rounded-2xl border border-[#34A853]/25 bg-[#34A853]/[0.06] dark:bg-[#34A853]/[0.08] p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-[#34A853]/15 flex items-center justify-center text-[#34A853] shrink-0">
                            <Star className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                            <p className="text-[11px] font-bold text-[#34A853] uppercase tracking-wide mb-0.5">Most recent session</p>
                            <p className="text-sm font-semibold text-neutral-800 dark:text-white/90">{latestSession.title} · {fmtDateFull(latestSession.date)}</p>
                            <p className="text-[12.5px] text-neutral-500 dark:text-white/50 mt-0.5">
                                {latestSession.checkInCount} check-ins across {latestSession.departmentCount} departments · {latestSession.autoCompletedCount} auto-completed check-outs
                            </p>
                        </div>
                        <button
                            onClick={handleJumpToLatest}
                            className="shrink-0 px-4 py-2 rounded-xl bg-white dark:bg-black/30 border border-[#34A853]/30 text-[#34A853] text-[12.5px] font-semibold hover:bg-[#34A853] hover:text-white transition-colors"
                        >
                            View this session
                        </button>
                    </div>
                </motion.section>
            )}

            {/* ═══ Charts ═══ */}
            <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-5"
            >
                <div className="lg:col-span-2 bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="text-sm font-bold text-neutral-800 dark:text-white/90">Check-ins over time</h2>
                        <span className="text-[11px] text-neutral-400 dark:text-white/35">Reflects active filters</span>
                    </div>
                    <p className="text-[12px] text-neutral-500 dark:text-white/40 mb-3">Volume per session date</p>
                    <div className="h-[220px]">
                        {trendData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={trendData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, rgba(0,0,0,0.06))" vertical={false} />
                                    <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }} />
                                    <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid rgba(52,168,83,0.3)", fontSize: "13px" }} />
                                    <Bar dataKey="count" fill="#34A853" radius={[6, 6, 0, 0]} maxBarSize={34} name="Check-ins" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-neutral-400 dark:text-white/30 text-sm">No data for this filter</div>
                        )}
                    </div>
                </div>
                <div className="bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
                    <h2 className="text-sm font-bold text-neutral-800 dark:text-white/90 mb-1">Turnout by department</h2>
                    <p className="text-[12px] text-neutral-500 dark:text-white/40 mb-3">Check-ins per department</p>
                    <div className="h-[220px]">
                        {deptData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={deptData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, rgba(0,0,0,0.06))" horizontal={false} />
                                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                                    <YAxis type="category" dataKey="dept" tick={{ fontSize: 10.5 }} width={120} />
                                    <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid rgba(52,168,83,0.3)", fontSize: "13px" }} />
                                    <Bar dataKey="count" fill="rgba(52,168,83,0.55)" radius={[0, 6, 6, 0]} name="Check-ins" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-neutral-400 dark:text-white/30 text-sm">No data</div>
                        )}
                    </div>
                </div>
            </motion.section>

            {/* ═══ Report Table / Grouped View ═══ */}
            <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02]">
                    <p className="text-[13px] text-neutral-500 dark:text-white/50">{filtered.length} matching check-in{filtered.length !== 1 ? "s" : ""}</p>
                    <p className="text-[11px] font-bold text-[#34A853] uppercase tracking-wide">{groupLabels[groupBy]}</p>
                </div>

                {filtered.length === 0 ? (
                    /* Empty State */
                    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                        <p className="text-sm font-semibold text-neutral-600 dark:text-white/60">No check-ins match these filters</p>
                        <p className="text-[12px] text-neutral-400 dark:text-white/35">Try widening the date range or clearing a filter.</p>
                    </div>
                ) : groupBy === "none" ? (
                    /* ═══ Flat Table ═══ */
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-neutral-50/50 dark:bg-white/[0.02] border-b border-neutral-200 dark:border-white/10 text-[11px] font-semibold text-neutral-500 dark:text-white/40 uppercase tracking-wider">
                                        {([
                                            { key: "worker", label: "Worker" },
                                            { key: "department", label: "Department", hide: "sm" },
                                            { key: "event", label: "Event", hide: "md" },
                                            { key: "date", label: "Date" },
                                        ] as { key: SortKey; label: string; hide?: string }[]).map((col) => (
                                            <th
                                                key={col.key}
                                                onClick={() => handleSort(col.key)}
                                                className={`px-6 py-3.5 cursor-pointer select-none hover:text-[#34A853] transition-colors ${col.hide ? `hidden ${col.hide}:table-cell` : ""}`}
                                            >
                                                {col.label}
                                                <span className={`inline-block ml-1 text-[10px] ${sortKey === col.key ? "opacity-100 text-[#34A853]" : "opacity-40"}`}>
                                                    {sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : "▲"}
                                                </span>
                                            </th>
                                        ))}
                                        {/* <th className="px-6 py-3.5">Status</th> */}
                                        <th
                                            onClick={() => handleSort("checkIn")}
                                            className="px-6 py-3.5 text-right cursor-pointer select-none hover:text-[#34A853] transition-colors"
                                        >
                                            Time log
                                            <span className={`inline-block ml-1 text-[10px] ${sortKey === "checkIn" ? "opacity-100 text-[#34A853]" : "opacity-40"}`}>
                                                {sortKey === "checkIn" ? (sortDir === "asc" ? "▲" : "▼") : "▲"}
                                            </span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-200 dark:divide-white/10">
                                    {pageItems.map((r) => (
                                        <tr key={r.id} className="hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <AvatarChip name={r.workerName} url={r.avatarUrl} />
                                                    <div>
                                                        <p className="text-[13.5px] font-medium text-neutral-800 dark:text-white/90">{r.workerName}</p>
                                                        <p className="text-[11.5px] text-neutral-400 dark:text-white/35 sm:hidden">{r.department}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3.5 hidden sm:table-cell text-[13px] text-neutral-600 dark:text-white/60">{r.department}</td>
                                            <td className="px-6 py-3.5 hidden md:table-cell text-[13px] text-neutral-600 dark:text-white/60">{r.eventTitle}</td>
                                            <td className="px-6 py-3.5">
                                                <div className="flex items-center gap-2 text-[13px] text-neutral-600 dark:text-white/70">
                                                    <CalendarDays className="w-3.5 h-3.5 opacity-50" />{fmtDateShort(r.date)}
                                                </div>
                                            </td>
                                            {/* <td className="px-6 py-3.5"><StatusBadge status={r.status} /></td> */}
                                            <td className="px-6 py-3.5 text-right">
                                                <div className="flex flex-col items-end gap-0.5 font-mono text-[12.5px]">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-neutral-700 dark:text-white/80">In {fmtTime(r.checkInTime)}</span>
                                                        <MethodTag isManual={r.isManual} />
                                                    </div>
                                                    <div className={`${offsetClass(r.offsetMin)} text-[11px]`}>{offsetLabel(r.offsetMin)}</div>
                                                    {r.checkOutTime && (
                                                        <div className="text-neutral-400 dark:text-white/35">
                                                            Out {fmtTime(r.checkOutTime)} · {fmtDuration((new Date(r.checkOutTime).getTime() - new Date(r.checkInTime).getTime()) / 60000)}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-t border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02]">
                            <p className="text-[13px] text-neutral-500 dark:text-white/50">
                                Showing <span className="font-semibold text-neutral-700 dark:text-white/80">{pageStart + 1}</span>–<span className="font-semibold text-neutral-700 dark:text-white/80">{Math.min(pageStart + PAGE_SIZE, sorted.length)}</span> of <span className="font-semibold text-neutral-700 dark:text-white/80">{sorted.length}</span>
                            </p>
                            <div className="flex items-center gap-3">
                                <p className="text-[13px] text-neutral-500 dark:text-white/50">
                                    Page <span className="font-semibold text-neutral-700 dark:text-white/80">{safePage}</span> of <span className="font-semibold text-neutral-700 dark:text-white/80">{totalPages}</span>
                                </p>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1} className="p-1.5 rounded-lg border border-neutral-200 dark:border-white/10 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages} className="p-1.5 rounded-lg border border-neutral-200 dark:border-white/10 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    /* ═══ Grouped Accordion View ═══ */
                    <div className="divide-y divide-neutral-200 dark:divide-white/10">
                        {grouped?.map(([key, rows]) => {
                            const { eyebrow, title, meta, hideCol } = groupHeader(key, rows);
                            const isOpen = openGroups.has(key);

                            return (
                                <div key={key}>
                                    <button
                                        onClick={() => toggleGroup(key)}
                                        className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <ChevronDown className={`w-4 h-4 text-neutral-400 dark:text-white/30 shrink-0 transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`} />
                                            <div className="min-w-0">
                                                {eyebrow && <p className="text-[10.5px] font-semibold text-[#34A853] uppercase tracking-wide">{eyebrow}</p>}
                                                <p className="text-[14px] font-semibold text-neutral-800 dark:text-white/90 truncate">{title}</p>
                                                <p className="text-[12px] text-neutral-500 dark:text-white/45 mt-0.5">{meta}</p>
                                            </div>
                                        </div>
                                        <span className="shrink-0 px-2.5 py-1 rounded-full bg-[#34A853]/10 text-[#34A853] text-[12px] font-bold font-mono">{rows.length}</span>
                                    </button>

                                    <AnimatePresence>
                                        {isOpen && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden bg-neutral-50/40 dark:bg-black/20 border-t border-neutral-100 dark:border-white/[0.06]"
                                            >
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left border-collapse">
                                                        <thead>
                                                            <tr className="text-[10.5px] font-semibold text-neutral-400 dark:text-white/35 uppercase tracking-wider">
                                                                {hideCol !== "worker" && <th className="px-5 py-2">Worker</th>}
                                                                {hideCol !== "department" && <th className="px-5 py-2">Department</th>}
                                                                {hideCol !== "event" && <th className="px-5 py-2">Event</th>}
                                                                {hideCol !== "date" && <th className="px-5 py-2">Date</th>}
                                                                {/* <th className="px-5 py-2">Status</th> */}
                                                                <th className="px-5 py-2 text-right">Time log</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
                                                            {rows.sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime()).map((r) => (
                                                                <tr key={r.id} className="hover:bg-neutral-50 dark:hover:bg-white/[0.02]">
                                                                    {hideCol !== "worker" && (
                                                                        <td className="px-5 py-2.5">
                                                                            <div className="flex items-center gap-2.5">
                                                                                <AvatarChip name={r.workerName} url={r.avatarUrl} />
                                                                                <span className="text-[13px] font-medium text-neutral-700 dark:text-white/80">{r.workerName}</span>
                                                                            </div>
                                                                        </td>
                                                                    )}
                                                                    {hideCol !== "department" && <td className="px-5 py-2.5 text-[12.5px] text-neutral-500 dark:text-white/50">{r.department}</td>}
                                                                    {hideCol !== "event" && <td className="px-5 py-2.5 text-[12.5px] text-neutral-500 dark:text-white/50">{r.eventTitle}</td>}
                                                                    {hideCol !== "date" && <td className="px-5 py-2.5 text-[12.5px] text-neutral-500 dark:text-white/50">{fmtDateShort(r.date)}</td>}
                                                                    {/* <td className="px-5 py-2.5"><StatusBadge status={r.status} /></td> */}
                                                                    <td className="px-5 py-2.5 text-right font-mono text-[12px] text-neutral-500 dark:text-white/50">
                                                                        {fmtTime(r.checkInTime)} – {r.checkOutTime ? fmtTime(r.checkOutTime) : "—"}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>
                )}
            </motion.section>

            {/* Export Modal */}
            <ExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
            />
        </div>
    );
}
