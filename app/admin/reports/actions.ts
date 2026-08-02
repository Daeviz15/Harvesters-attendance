"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdminAuth } from "@/lib/rbac";

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "An unexpected error occurred.";
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type ReportLog = {
    id: string;
    workerName: string;
    avatarUrl: string | null;
    department: string;
    eventTitle: string;
    date: string;           // YYYY-MM-DD
    checkInTime: string;    // ISO
    checkOutTime: string | null; // ISO
    status: string;         // 'active' | 'completed' | 'auto_completed'
    isManual: boolean;      // true = proxy check-in, false = GPS self check-in
    offsetMin: number;      // minutes relative to session start (negative = early)
    sessionStartTime: string | null; // ISO — the session broadcast start
};

export type ReportsPayload = {
    logs: ReportLog[];
    departments: string[];
    events: string[];
    latestSession: {
        title: string;
        date: string;
        checkInCount: number;
        departmentCount: number;
        autoCompletedCount: number;
    } | null;
};

// ── Data Fetcher ───────────────────────────────────────────────────────────────

export async function getReportsData(): Promise<{ data?: ReportsPayload; error?: string }> {
    try {
        const scope = await requireAdminAuth();
        const { isSuperAdmin, managedDepartmentIds } = scope;
        const supabase = await createClient();

        // 1. If Department Head, resolve worker IDs in their departments
        let deptWorkerIds: string[] | null = null;
        if (!isSuperAdmin) {
            const { data: deptWorkers } = await supabase
                .from("profiles")
                .select("id")
                .in("department_id", managedDepartmentIds);
            deptWorkerIds = (deptWorkers || []).map((w) => w.id);
        }

        // 2. Fetch all attendance logs with joined session + event data
        let query = supabase
            .from("attendance_logs")
            .select(`
                id,
                user_id,
                check_in_time,
                check_out_time,
                status,
                department,
                is_manual,
                session_id,
                session:attendance_sessions (
                    start_time,
                    event:events (title)
                )
            `)
            .order("check_in_time", { ascending: false });

        // RBAC scoping for Department Heads
        if (!isSuperAdmin && deptWorkerIds) {
            if (deptWorkerIds.length === 0) {
                // No workers in their departments — return empty
                return {
                    data: { logs: [], departments: [], events: [], latestSession: null },
                };
            }
            query = query.in("user_id", deptWorkerIds);
        }

        const { data: rawLogs, error: logsError } = await query;

        if (logsError) {
            console.error("[Reports] Error fetching logs:", logsError);
            return { error: "Failed to load attendance data." };
        }

        if (!rawLogs || rawLogs.length === 0) {
            return {
                data: { logs: [], departments: [], events: [], latestSession: null },
            };
        }

        // 3. Batch-fetch profiles for all unique user_ids
        const uniqueUserIds = Array.from(new Set(rawLogs.map((l) => l.user_id)));
        const { data: profiles } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url")
            .in("id", uniqueUserIds);

        const profileMap = new Map(
            (profiles || []).map((p) => [
                p.id,
                {
                    name: `${p.first_name || "Unknown"} ${p.last_name || ""}`.trim(),
                    avatarUrl: p.avatar_url,
                },
            ])
        );

        // 4. Transform raw logs into ReportLog[]
        const departmentsSet = new Set<string>();
        const eventsSet = new Set<string>();

        const logs: ReportLog[] = rawLogs.map((log) => {
            const profile = profileMap.get(log.user_id);
            const session = Array.isArray(log.session) ? log.session[0] : log.session;
            const event = session
                ? Array.isArray(session.event)
                    ? session.event[0]
                    : session.event
                : null;

            const eventTitle = event?.title || "Unknown Event";
            const dept = log.department || "Unknown";
            const sessionStartTime = session?.start_time || null;

            departmentsSet.add(dept);
            eventsSet.add(eventTitle);

            // Calculate arrival offset in minutes
            let offsetMin = 0;
            if (sessionStartTime && log.check_in_time) {
                const sessionStart = new Date(sessionStartTime).getTime();
                const checkIn = new Date(log.check_in_time).getTime();
                offsetMin = Math.round((checkIn - sessionStart) / 60000);
            }

            // Extract date as YYYY-MM-DD from check_in_time
            const date = log.check_in_time
                ? new Date(log.check_in_time).toISOString().slice(0, 10)
                : "";

            return {
                id: log.id,
                workerName: profile?.name || "Unknown",
                avatarUrl: profile?.avatarUrl || null,
                department: dept,
                eventTitle,
                date,
                checkInTime: log.check_in_time,
                checkOutTime: log.check_out_time,
                status: log.status,
                isManual: !!log.is_manual,
                offsetMin,
                sessionStartTime,
            };
        });

        // 5. Compute latest session summary
        let latestSession: ReportsPayload["latestSession"] = null;
        if (logs.length > 0) {
            // The most recent date
            const latestDate = logs[0].date;
            const latestEvent = logs[0].eventTitle;
            const latestLogs = logs.filter(
                (l) => l.date === latestDate && l.eventTitle === latestEvent
            );
            const latestDepts = new Set(latestLogs.map((l) => l.department));

            latestSession = {
                title: latestEvent,
                date: latestDate,
                checkInCount: latestLogs.length,
                departmentCount: latestDepts.size,
                autoCompletedCount: latestLogs.filter(
                    (l) => l.status === "auto_completed"
                ).length,
            };
        }

        return {
            data: {
                logs,
                departments: Array.from(departmentsSet).sort(),
                events: Array.from(eventsSet).sort(),
                latestSession,
            },
        };
    } catch (e: unknown) {
        console.error("[Reports] Unexpected error:", e);
        return { error: getErrorMessage(e) };
    }
}
