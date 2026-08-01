"use server";

import { createClient } from "@/utils/supabase/server";
import { requireAdminAuth } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export async function beginSession(eventId: string) {
    try {
        const scope = await requireAdminAuth();
        const { user } = scope;
        const supabase = await createClient();

        // Department Head boundary: verify the event belongs to their scope
        if (!scope.isSuperAdmin) {
            const { data: event } = await supabase
                .from('events')
                .select('department_id, created_by')
                .eq('id', eventId)
                .maybeSingle();

            if (!event) return { error: "Event not found." };

            const ownsEvent = event.created_by === user.id;
            const managesDept = event.department_id && scope.managedDepartmentIds.includes(event.department_id);
            if (!ownsEvent && !managesDept) {
                return { error: "You do not have permission to start sessions for this event." };
            }
        }

        const { error } = await supabase.rpc('start_attendance_session', {
            event_uuid: eventId,
            actor_uuid: user.id,
        });

        if (error) {
            console.error("Begin Session Error:", error);
            if (error.code === '42883') {
                return { error: "Session automation migration is missing. Run supabase_session_automation_migration.sql first." };
            }
            if (error.code === '23505') {
                return { error: "An active session already exists for this event." };
            }
            return { error: "Failed to begin session. Please try again." };
        }

        revalidatePath("/admin/sessions");
        revalidatePath("/admin");
        revalidatePath("/dashboard");
        return { success: true };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function endSession(sessionId: string) {
    try {
        const scope = await requireAdminAuth();
        const supabase = await createClient();

        // Department Head boundary: verify the session's event belongs to their scope
        if (!scope.isSuperAdmin) {
            const { data: session } = await supabase
                .from('attendance_sessions')
                .select('event_id, event:events(department_id, created_by)')
                .eq('id', sessionId)
                .maybeSingle();

            if (!session) return { error: "Session not found." };

            const event = Array.isArray(session.event) ? session.event[0] : session.event;
            if (event) {
                const ownsEvent = event.created_by === scope.user.id;
                const managesDept = event.department_id && scope.managedDepartmentIds.includes(event.department_id);
                if (!ownsEvent && !managesDept) {
                    return { error: "You do not have permission to end this session." };
                }
            }
        }
        
        const { error } = await supabase.rpc('end_attendance_session', {
            session_uuid: sessionId,
        });

        if (error) {
            console.error("End Session Error:", error);
            if (error.code === '42883') {
                return { error: "Session automation migration is missing. Run supabase_session_automation_migration.sql first." };
            }
            return { error: "Failed to end session. It may have already ended." };
        }

        revalidatePath("/admin/sessions");
        revalidatePath("/admin");
        revalidatePath("/dashboard");
        return { success: true };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function extendSessionTime(sessionId: string, additionalMinutes: number) {
    try {
        if (!additionalMinutes || additionalMinutes <= 0 || additionalMinutes > 1440) {
            return { error: "Please provide a valid duration between 1 and 1440 minutes." };
        }

        const scope = await requireAdminAuth();
        const supabase = await createClient();

        const { data: session, error: sessionError } = await supabase
            .from('attendance_sessions')
            .select('id, status, scheduled_end_at, end_time, event_id, event:events(department_id, created_by)')
            .eq('id', sessionId)
            .maybeSingle();

        if (sessionError || !session) {
            return { error: "Session not found." };
        }

        if (session.status !== 'active') {
            return { error: "Cannot extend time on a session that is no longer active." };
        }

        // Department Head boundary check
        if (!scope.isSuperAdmin) {
            const event = Array.isArray(session.event) ? session.event[0] : session.event;
            if (event) {
                const ownsEvent = event.created_by === scope.user.id;
                const managesDept = event.department_id && scope.managedDepartmentIds.includes(event.department_id);
                if (!ownsEvent && !managesDept) {
                    return { error: "You do not have permission to modify this session." };
                }
            }
        }

        const now = new Date();
        const baseIso = session.scheduled_end_at || session.end_time;
        let baseDate = baseIso ? new Date(baseIso) : now;

        // If the scheduled end time is in the past, extend starting from now
        if (isNaN(baseDate.getTime()) || baseDate < now) {
            baseDate = now;
        }

        const newEndDate = new Date(baseDate.getTime() + additionalMinutes * 60 * 1000);
        const newEndIso = newEndDate.toISOString();

        const { error: updateError } = await supabase
            .from('attendance_sessions')
            .update({
                scheduled_end_at: newEndIso,
                end_time: newEndIso,
            })
            .eq('id', sessionId);

        if (updateError) {
            console.error("Extend Session Error:", updateError);
            return { error: "Failed to extend session duration." };
        }

        revalidatePath("/admin/sessions");
        revalidatePath("/admin/events");
        revalidatePath("/admin");
        revalidatePath("/dashboard");

        return { 
            success: true, 
            newScheduledEndAt: newEndIso,
            message: `Session extended by ${additionalMinutes} minute${additionalMinutes > 1 ? 's' : ''}.` 
        };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function searchWorkersForCheckIn(query: string, sessionId: string) {
    try {
        const scope = await requireAdminAuth();
        const { isSuperAdmin, managedDepartmentIds } = scope;
        const supabase = await createClient();

        const cleanQuery = query.trim().replace(/[,()]/g, ' ').trim();

        const { data: existingLogs } = await supabase
            .from("attendance_logs")
            .select("user_id")
            .eq("session_id", sessionId)
            .eq("status", "active");

        const checkedInUserIds = new Set((existingLogs || []).map((log) => log.user_id));

        let profilesQuery = supabase
            .from("profiles")
            .select("id, first_name, last_name, phone, department, department_id, avatar_url, role, worker_id")
            .order("first_name", { ascending: true })
            .limit(50);

        if (!isSuperAdmin) {
            profilesQuery = profilesQuery.in("department_id", managedDepartmentIds);
        }

        if (cleanQuery.length > 0) {
            profilesQuery = profilesQuery.or(
                `first_name.ilike.%${cleanQuery}%,last_name.ilike.%${cleanQuery}%,phone.ilike.%${cleanQuery}%,department.ilike.%${cleanQuery}%,worker_id.ilike.%${cleanQuery}%`
            );
        }

        let { data: workers, error } = await profilesQuery;

        if (error && (error.code === '42703' || error.message?.toLowerCase().includes('worker_id'))) {
            let fallbackQuery = supabase
                .from("profiles")
                .select("id, first_name, last_name, phone, department, department_id, avatar_url, role")
                .order("first_name", { ascending: true })
                .limit(50);

            if (!isSuperAdmin) {
                fallbackQuery = fallbackQuery.in("department_id", managedDepartmentIds);
            }

            if (cleanQuery.length > 0) {
                fallbackQuery = fallbackQuery.or(
                    `first_name.ilike.%${cleanQuery}%,last_name.ilike.%${cleanQuery}%,phone.ilike.%${cleanQuery}%,department.ilike.%${cleanQuery}%`
                );
            }

            const fallbackRes = await fallbackQuery;
            workers = (fallbackRes.data || []).map((w: any) => ({ ...w, worker_id: null }));
            error = fallbackRes.error;
        }

        if (error) {
            console.error("Search Workers Error:", error);
            return { error: "Failed to search workers." };
        }

        const formattedWorkers = (workers || []).map((w) => ({
            ...w,
            email: null,
            isCheckedIn: checkedInUserIds.has(w.id),
        }));

        return { data: formattedWorkers };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function manualWorkerCheckIn(params: { workerId: string; sessionId: string; note?: string }) {
    try {
        const scope = await requireAdminAuth();
        const { isSuperAdmin, managedDepartmentIds, user: adminUser } = scope;
        const supabase = await createClient();

        const { workerId, sessionId, note } = params;

        if (!workerId || !sessionId) {
            return { error: "Worker ID and Session ID are required." };
        }

        const { data: workerProfile, error: workerError } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, department, department_id, team")
            .eq("id", workerId)
            .single();

        if (workerError || !workerProfile) {
            return { error: "Worker profile not found." };
        }

        if (!isSuperAdmin && workerProfile.department_id && !managedDepartmentIds.includes(workerProfile.department_id)) {
            return { error: "Forbidden: You can only check in workers from your managed department." };
        }

        const { data: session, error: sessionError } = await supabase
            .from("attendance_sessions")
            .select("id, status")
            .eq("id", sessionId)
            .single();

        if (sessionError || !session || session.status !== "active") {
            return { error: "This session is no longer active." };
        }

        const { data: existingCheckIn } = await supabase
            .from("attendance_logs")
            .select("id")
            .eq("user_id", workerId)
            .eq("session_id", sessionId)
            .eq("status", "active")
            .maybeSingle();

        if (existingCheckIn) {
            return { error: "Worker is already checked in for this session." };
        }

        const { error: insertError } = await supabase
            .from("attendance_logs")
            .insert({
                user_id: workerId,
                session_id: sessionId,
                department: workerProfile.department || "General",
                team: workerProfile.team || "General",
                status: "active",
                check_in_lat: 0.0,
                check_in_lng: 0.0,
                is_manual: true,
                checked_in_by: adminUser.id,
                check_in_note: note || "Manually checked in by Admin",
            });

        if (insertError) {
            console.error("Manual Check-In Insert Error:", insertError);
            return { error: "Failed to record worker check-in." };
        }

        revalidatePath("/admin/sessions");
        revalidatePath("/admin/history");
        revalidatePath("/admin");

        return { success: true, workerName: `${workerProfile.first_name || ""} ${workerProfile.last_name || ""}`.trim() };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export type WorkerCheckInInfo = {
    id: string;
    firstName: string;
    lastName: string;
    workerId: string | null;
    avatarUrl: string | null;
    department: string;
    checkInTime: string;
    checkInNote?: string | null;
    isManual: boolean;
};

export type DepartmentBreakdownItem = {
    id: string;
    name: string;
    department: string;
    count: number;
    workers: WorkerCheckInInfo[];
};

export type MinistryGroup = {
    team: string;
    totalCount: number;
    percentage: number;
    departments: DepartmentBreakdownItem[];
};

export type AnalyticsData = {
    totalCheckIns: number;
    selfGpsCheckIns: number;
    proxyCheckIns: number;
    gpsRatePercent: number;
    activeSessionsCount: number;
    totalWorkersCount: number;
    ministryTurnout: Array<{ team: string; count: number; percentage: number }>;
    topDepartments: Array<{ team: string; department: string; count: number }>;
    latestSessionSummary: { id: string; title: string; date: string; totalCheckedIn: number } | null;
    attendanceTrends: Array<{ date: string; checkIns: number }>;
};

export async function getDepartmentAttendanceBreakdown(sessionId?: string) {
    try {
        const scope = await requireAdminAuth();
        const { isSuperAdmin, managedDepartmentIds } = scope;
        const supabase = await createClient();

        let targetSessionId = sessionId;
        if (!targetSessionId) {
            const { data: activeSession } = await supabase
                .from('attendance_sessions')
                .select('id')
                .eq('status', 'active')
                .order('start_time', { ascending: false })
                .limit(1)
                .maybeSingle();

            targetSessionId = activeSession?.id;
        }

        if (!targetSessionId) {
            return { data: { totalCheckedIn: 0, ministries: [] } };
        }

        let logsQuery = supabase
            .from('attendance_logs')
            .select('id, user_id, department, team, check_in_time, check_in_note, is_manual')
            .eq('session_id', targetSessionId)
            .eq('status', 'active');

        if (!isSuperAdmin) {
            const { data: deptWorkers } = await supabase
                .from('profiles')
                .select('id')
                .in('department_id', managedDepartmentIds);
            const deptWorkerIds = (deptWorkers || []).map((w) => w.id);
            logsQuery = logsQuery.in('user_id', deptWorkerIds.length > 0 ? deptWorkerIds : ['00000000-0000-0000-0000-000000000000']);
        }

        const { data: logs, error } = await logsQuery;
        if (error) {
            console.error("Error fetching breakdown:", error);
            return { error: "Failed to fetch attendance breakdown." };
        }

        const totalCheckedIn = logs?.length || 0;

        const userIds = Array.from(new Set((logs || []).map(l => l.user_id)));
        const { data: profiles } = userIds.length > 0 ? await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, worker_id, department_id')
            .in('id', userIds) : { data: [] };

        const profilesMap = new Map((profiles || []).map(p => [p.id, p]));

        const teamMap = new Map<string, Map<string, WorkerCheckInInfo[]>>();

        for (const log of logs || []) {
            const p = profilesMap.get(log.user_id);
            const teamName = log.team || "GENERAL";
            const deptName = log.department || "General";

            if (!teamMap.has(teamName)) teamMap.set(teamName, new Map());
            const deptMap = teamMap.get(teamName)!;
            if (!deptMap.has(deptName)) deptMap.set(deptName, []);

            deptMap.get(deptName)!.push({
                id: log.user_id,
                firstName: p?.first_name || "Unknown",
                lastName: p?.last_name || "",
                workerId: p?.worker_id || null,
                avatarUrl: p?.avatar_url || null,
                department: deptName,
                checkInTime: log.check_in_time,
                checkInNote: log.check_in_note || null,
                isManual: !!log.is_manual,
            });
        }

        const ministries: MinistryGroup[] = Array.from(teamMap.entries()).map(([teamName, deptMap]) => {
            let teamTotal = 0;
            const departments: DepartmentBreakdownItem[] = Array.from(deptMap.entries()).map(([deptName, workers]) => {
                teamTotal += workers.length;
                return {
                    id: deptName,
                    name: deptName,
                    department: deptName,
                    count: workers.length,
                    workers,
                };
            });

            return {
                team: teamName,
                totalCount: teamTotal,
                percentage: totalCheckedIn > 0 ? Math.round((teamTotal / totalCheckedIn) * 100) : 0,
                departments,
            };
        });

        return { data: { totalCheckedIn, ministries } };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function getAttendanceAnalytics() {
    try {
        const scope = await requireAdminAuth();
        const { isSuperAdmin, managedDepartmentIds } = scope;
        const supabase = await createClient();

        let deptWorkerIds: string[] | null = null;
        if (!isSuperAdmin) {
            const { data: deptWorkers } = await supabase
                .from('profiles')
                .select('id')
                .in('department_id', managedDepartmentIds);
            deptWorkerIds = (deptWorkers || []).map((w) => w.id);
        }

        let logsQuery = supabase.from('attendance_logs').select('id, user_id, is_manual, department', { count: 'exact' });
        let workersQuery = supabase.from('profiles').select('id', { count: 'exact', head: true });

        if (!isSuperAdmin && deptWorkerIds) {
            logsQuery = logsQuery.in('user_id', deptWorkerIds.length > 0 ? deptWorkerIds : ['00000000-0000-0000-0000-000000000000']);
            workersQuery = workersQuery.in('department_id', managedDepartmentIds);
        }

        const [logsRes, workersRes, activeSessionsRes] = await Promise.all([
            logsQuery,
            workersQuery,
            supabase.from('attendance_sessions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        ]);

        const logs = logsRes.data || [];
        const totalCheckIns = logsRes.count || logs.length;
        const totalWorkersCount = workersRes.count || 0;
        const activeSessionsCount = activeSessionsRes.count || 0;

        let proxyCheckIns = 0;
        let selfGpsCheckIns = 0;

        for (const log of logs) {
            if (log.is_manual) {
                proxyCheckIns++;
            } else {
                selfGpsCheckIns++;
            }
        }

        const gpsRatePercent = totalCheckIns > 0 ? Math.round((selfGpsCheckIns / totalCheckIns) * 100) : 0;

        return {
            data: {
                totalCheckIns,
                selfGpsCheckIns,
                proxyCheckIns,
                gpsRatePercent,
                activeSessionsCount,
                totalWorkersCount,
                ministryTurnout: [],
                topDepartments: [],
                latestSessionSummary: null,
                attendanceTrends: [],
            }
        };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}
