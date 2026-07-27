"use client";

import { motion } from "framer-motion";
import { BarChart3, Users, CheckCircle2, ShieldCheck, MapPin, Building2, TrendingUp, Calendar, Activity } from "lucide-react";
import type { AnalyticsData } from "@/app/admin/sessions/actions";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface AttendanceAnalyticsViewProps {
    analytics: AnalyticsData;
}

const TEAM_COLORS: Record<string, { bg: string; text: string; border: string; bar: string }> = {
    PROGRAMS: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/20", bar: "bg-blue-500" },
    MINISTRY: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500/20", bar: "bg-purple-500" },
    MATURITY: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20", bar: "bg-amber-500" },
    MEMBERSHIP: { bg: "bg-pink-500/10", text: "text-pink-600 dark:text-pink-400", border: "border-pink-500/20", bar: "bg-pink-500" },
    MISSIONS: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20", bar: "bg-emerald-500" },
    "NEXT GEN": { bg: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-500/20", bar: "bg-indigo-500" },
    GENERAL: { bg: "bg-neutral-500/10", text: "text-neutral-600 dark:text-neutral-400", border: "border-neutral-500/20", bar: "bg-neutral-500" },
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 p-3 rounded-xl shadow-lg">
                <p className="text-sm font-bold text-neutral-900 dark:text-white mb-1">{label}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">{payload[0].payload.title}</p>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#34A853]" />
                    <span className="text-sm font-semibold text-[#34A853]">
                        {payload[0].value} <span className="text-neutral-500 font-normal">Checked in</span>
                    </span>
                </div>
            </div>
        );
    }
    return null;
};

export default function AttendanceAnalyticsView({ analytics }: AttendanceAnalyticsViewProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                            Total Attendance Logs
                        </span>
                        <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <BarChart3 className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-neutral-900 dark:text-white">
                        {analytics.totalCheckIns}
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-1">
                        All-time recorded check-in logs
                    </p>
                </div>

                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                            GPS Self-Checkin Rate
                        </span>
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                            <MapPin className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-neutral-900 dark:text-white">
                        {analytics.gpsRatePercent}%
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-1">
                        {analytics.selfGpsCheckIns} Self GPS vs {analytics.proxyCheckIns} Proxy Logs
                    </p>
                </div>

                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                            Proxy & Manual Signs
                        </span>
                        <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-neutral-900 dark:text-white">
                        {analytics.proxyCheckIns}
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-1">
                        Signed in by Admins (Errands/Permissions)
                    </p>
                </div>

                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                            Registered Workforce
                        </span>
                        <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                            <Users className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-neutral-900 dark:text-white">
                        {analytics.totalWorkersCount}
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-1">
                        Total profiles on database
                    </p>
                </div>
            </div>

            {/* Overall Performance Trend Chart */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                            <Activity className="w-5 h-5 text-[#34A853]" />
                            Overall Performance Trends
                        </h3>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Attendance volume over the last 10 sessions
                        </p>
                    </div>
                </div>
                
                {analytics.attendanceTrends && analytics.attendanceTrends.length > 0 ? (
                    <div className="w-full h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                                data={analytics.attendanceTrends}
                                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                            >
                                <defs>
                                    <linearGradient id="colorAttendance" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#34A853" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#34A853" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-neutral-200 dark:text-white/5" />
                                <XAxis 
                                    dataKey="session_date" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 12 }} 
                                    className="text-neutral-500 dark:text-neutral-400"
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 12 }} 
                                    className="text-neutral-500 dark:text-neutral-400"
                                    dx={-10}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Area 
                                    type="monotone" 
                                    dataKey="attendance" 
                                    stroke="#34A853" 
                                    strokeWidth={3}
                                    fillOpacity={1} 
                                    fill="url(#colorAttendance)" 
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="w-full h-[300px] flex items-center justify-center border-2 border-dashed border-neutral-200 dark:border-white/10 rounded-xl">
                        <p className="text-sm text-neutral-500">Not enough session data to generate trends.</p>
                    </div>
                )}
            </div>

            {/* Ministry Breakdown & Top Departments */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Ministry Turnout Bars */}
                <div className="lg:col-span-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6">
                    <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/5 pb-4">
                        <div>
                            <h3 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-[#34A853]" />
                                Ministry Turnout Share
                            </h3>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                                Breakdown of attendance logs grouped by Ministry Team
                            </p>
                        </div>
                    </div>

                    {analytics.ministryTurnout.length === 0 ? (
                        <p className="text-xs text-neutral-500 text-center py-6">No ministry data recorded yet.</p>
                    ) : (
                        <div className="space-y-4">
                            {analytics.ministryTurnout.map(item => {
                                const style = TEAM_COLORS[item.team] || TEAM_COLORS.GENERAL;
                                return (
                                    <div key={item.team} className="space-y-1.5">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className={`font-bold px-2 py-0.5 rounded border text-[10px] uppercase ${style.bg} ${style.text} ${style.border}`}>
                                                {item.team} MINISTRY
                                            </span>
                                            <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                                                {item.count} check-ins ({item.percentage}%)
                                            </span>
                                        </div>
                                        <div className="w-full h-3 bg-neutral-100 dark:bg-white/5 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${item.percentage}%` }}
                                                transition={{ duration: 0.8, ease: "easeOut" }}
                                                className={`h-full rounded-full ${style.bar}`}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Top Departments */}
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6">
                    <div className="border-b border-neutral-100 dark:border-white/5 pb-4">
                        <h3 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-[#34A853]" />
                            Top Turnout Departments
                        </h3>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Highest attendance volume by department
                        </p>
                    </div>

                    {analytics.topDepartments.length === 0 ? (
                        <p className="text-xs text-neutral-500 text-center py-6">No department data recorded yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {analytics.topDepartments.map((dept, idx) => {
                                const style = TEAM_COLORS[dept.team] || TEAM_COLORS.GENERAL;
                                return (
                                    <div
                                        key={`${dept.team}:${dept.department}`}
                                        className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-100 dark:border-white/5"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-white/10 text-neutral-700 dark:text-white text-xs font-bold flex items-center justify-center shrink-0">
                                                {idx + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                                                    {dept.department}
                                                </p>
                                                <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded mt-0.5 border ${style.bg} ${style.text} ${style.border}`}>
                                                    {dept.team}
                                                </span>
                                            </div>
                                        </div>
                                        <span className="px-2.5 py-1 bg-[#34A853]/10 text-[#34A853] text-xs font-bold rounded-lg shrink-0">
                                            {dept.count}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Latest Event Summary Banner */}
            {analytics.latestSessionSummary && (
                <div className="bg-gradient-to-r from-neutral-900 to-neutral-800 text-white rounded-2xl p-5 sm:p-6 shadow-sm border border-neutral-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-[#34A853]" />
                            <span className="text-xs font-semibold text-[#34A853] uppercase tracking-wider">
                                Latest Service Event
                            </span>
                        </div>
                        <h4 className="text-lg font-bold text-white">
                            {analytics.latestSessionSummary.title}
                        </h4>
                        <p className="text-xs text-neutral-400">
                            Session Date: {new Date(analytics.latestSessionSummary.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 bg-white/10 rounded-xl border border-white/10 text-center">
                            <span className="text-xs text-neutral-400 block">Total Turnout</span>
                            <span className="text-xl font-bold text-[#34A853]">
                                {analytics.latestSessionSummary.totalCheckedIn} Workers
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
