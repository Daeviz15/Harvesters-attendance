"use server";

import { createClient } from "@/utils/supabase/server";
import { requireReportsAuth } from "@/lib/rbac";

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "An unexpected error occurred.";
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type DepartmentOption = {
    id: string;
    name: string;
    team: string | null;
    team_id: string | null;
};

export type TeamOption = {
    id: string;
    name: string;
    code: string | null;
};

export type ReportLog = {
    id: string;
    workerName: string;
    avatarUrl: string | null;
    department: string;
    departmentId: string | null;
    team: string | null;
    teamId: string | null;
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
    departments: DepartmentOption[];
    teams: TeamOption[];
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
        const scope = await requireReportsAuth();
        const { hasGlobalReportAccess, reportDepartmentIds } = scope;
        const supabase = await createClient();

        // 1. Fetch active departments and teams
        const [departmentsRes, teamsRes] = await Promise.all([
            supabase
                .from("departments")
                .select("id, name, team, team_id, is_active")
                .eq("is_active", true)
                .order("name", { ascending: true }),
            supabase
                .from("teams")
                .select("id, name, code, is_active")
                .eq("is_active", true)
                .order("name", { ascending: true }),
        ]);

        let departmentRows = (departmentsRes.data || []) as DepartmentOption[];
        let teamRows = (teamsRes.data || []) as TeamOption[];

        // RBAC scoping for non-global report readers
        let deptWorkerIds: string[] | null = null;
        if (!hasGlobalReportAccess) {
            if (reportDepartmentIds.length === 0) {
                return {
                    data: { logs: [], departments: [], teams: [], events: [], latestSession: null },
                };
            }

            departmentRows = departmentRows.filter((d) => reportDepartmentIds.includes(d.id));
            const allowedTeamIds = new Set(departmentRows.map((d) => d.team_id).filter(Boolean));
            teamRows = teamRows.filter((t) => allowedTeamIds.has(t.id));

            const { data: deptWorkers } = await supabase
                .from("profiles")
                .select("id")
                .in("department_id", reportDepartmentIds);
            deptWorkerIds = (deptWorkers || []).map((w) => w.id);
        }

        const deptNameToInfoMap = new Map<string, DepartmentOption>();
        const deptIdToInfoMap = new Map<string, DepartmentOption>();
        departmentRows.forEach((d) => {
            deptNameToInfoMap.set(d.name, d);
            deptIdToInfoMap.set(d.id, d);
        });

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

        if (!hasGlobalReportAccess && deptWorkerIds) {
            if (deptWorkerIds.length === 0) {
                return {
                    data: { logs: [], departments: departmentRows, teams: teamRows, events: [], latestSession: null },
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
                data: { logs: [], departments: departmentRows, teams: teamRows, events: [], latestSession: null },
            };
        }

        // 3. Batch-fetch profiles for all unique user_ids
        const uniqueUserIds = Array.from(new Set(rawLogs.map((l) => l.user_id)));
        const { data: profiles } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url, department, department_id, team, team_id")
            .in("id", uniqueUserIds);

        const profileMap = new Map(
            (profiles || []).map((p) => [
                p.id,
                {
                    name: `${p.first_name || "Unknown"} ${p.last_name || ""}`.trim(),
                    avatarUrl: p.avatar_url,
                    department: p.department,
                    departmentId: p.department_id,
                    team: p.team,
                    teamId: p.team_id,
                },
            ])
        );

        // 4. Transform raw logs into ReportLog[]
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
            const dept = log.department || profile?.department || "Unknown";
            const deptInfo = deptNameToInfoMap.get(dept) || (profile?.departmentId ? deptIdToInfoMap.get(profile.departmentId) : undefined);
            const deptId = profile?.departmentId || deptInfo?.id || null;
            const teamName = profile?.team || deptInfo?.team || null;
            const teamId = profile?.teamId || deptInfo?.team_id || null;
            const sessionStartTime = session?.start_time || null;

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
                departmentId: deptId,
                team: teamName,
                teamId: teamId,
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

        // Deduplicate departments by id and normalized name
        const deptMap = new Map<string, DepartmentOption>();
        const existingNamesNormalized = new Set<string>();

        for (const d of departmentRows) {
            deptMap.set(d.id, d);
            existingNamesNormalized.add(d.name.trim().toLowerCase());
        }

        for (const log of logs) {
            const trimmedName = (log.department || "").trim();
            if (
                trimmedName &&
                trimmedName !== "Unknown" &&
                !existingNamesNormalized.has(trimmedName.toLowerCase())
            ) {
                const newId = log.departmentId && !deptMap.has(log.departmentId)
                    ? log.departmentId
                    : `log-dept-${trimmedName}`;

                const newDept: DepartmentOption = {
                    id: newId,
                    name: trimmedName,
                    team: log.team || null,
                    team_id: log.teamId || null,
                };
                deptMap.set(newId, newDept);
                existingNamesNormalized.add(trimmedName.toLowerCase());
            }
        }

        const finalDepartments = Array.from(deptMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
        );

        return {
            data: {
                logs,
                departments: finalDepartments,
                teams: teamRows,
                events: Array.from(eventsSet).sort(),
                latestSession,
            },
        };
    } catch (e: unknown) {
        console.error("[Reports] Unexpected error:", e);
        return { error: getErrorMessage(e) };
    }
}
