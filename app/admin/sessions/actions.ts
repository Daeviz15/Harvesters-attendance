"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "An unexpected error occurred.";
}

async function verifyAdminServer() {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || profile.role !== 'admin') {
        throw new Error("Forbidden: Admin access required");
    }

    return { supabase, user };
}

export async function beginSession(eventId: string) {
    try {
        const { supabase, user } = await verifyAdminServer();

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
        const { supabase } = await verifyAdminServer();
        
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

export async function searchWorkersForCheckIn(query: string, sessionId: string) {
    try {
        const { supabase } = await verifyAdminServer();
        const cleanQuery = query.trim().replace(/[,()]/g, ' ').trim();

        
        const { data: existingLogs } = await supabase
            .from("attendance_logs")
            .select("user_id")
            .eq("session_id", sessionId)
            .eq("status", "active");

        const checkedInUserIds = new Set((existingLogs || []).map((log) => log.user_id));

        
        let profilesQuery = supabase
            .from("profiles")
            .select("id, first_name, last_name, phone, department, avatar_url, role, worker_id")
            .order("first_name", { ascending: true })
            .limit(50);

        if (cleanQuery.length > 0) {
            profilesQuery = profilesQuery.or(
                `first_name.ilike.%${cleanQuery}%,last_name.ilike.%${cleanQuery}%,phone.ilike.%${cleanQuery}%,department.ilike.%${cleanQuery}%,worker_id.ilike.%${cleanQuery}%`
            );
        }

        let { data: workers, error } = await profilesQuery;

        // Robust production fallback: If worker_id column is not yet created in Supabase SQL editor, fall back to standard selection
        if (error && (error.code === '42703' || error.message?.toLowerCase().includes('worker_id'))) {
            let fallbackQuery = supabase
                .from("profiles")
                .select("id, first_name, last_name, phone, department, avatar_url, role")
                .order("first_name", { ascending: true })
                .limit(50);

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
        const { supabase, user: adminUser } = await verifyAdminServer();
        const { workerId, sessionId, note } = params;

        if (!workerId || !sessionId) {
            return { error: "Worker ID and Session ID are required." };
        }

        // 1. Verify session is active
        const { data: session, error: sessionError } = await supabase
            .from("attendance_sessions")
            .select("id, status")
            .eq("id", sessionId)
            .single();

        if (sessionError || !session || session.status !== "active") {
            return { error: "This session is no longer active." };
        }

        // 2. Check if worker is already checked in
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

        // 3. Fetch worker profile for department details
        const { data: workerProfile } = await supabase
            .from("profiles")
            .select("department, team")
            .eq("id", workerId)
            .single();

        // 4. Perform proxy manual check-in
        let insertData: any = {
            user_id: workerId,
            session_id: sessionId,
            department: workerProfile?.department || "General",
            team: workerProfile?.team || null,
            status: "active",
            check_in_lat: 0.0,
            check_in_lng: 0.0,
            is_manual: true,
            checked_in_by: adminUser.id,
            check_in_note: note || "Manually checked in by Admin",
        };

        let { error: insertError } = await supabase
            .from("attendance_logs")
            .insert(insertData);

        // Fallback if is_manual / checked_in_by columns do not exist in database yet
        if (insertError && (insertError.code === '42703' || insertError.message?.toLowerCase().includes('column'))) {
            delete insertData.is_manual;
            delete insertData.checked_in_by;
            delete insertData.check_in_note;

            const fallbackInsert = await supabase
                .from("attendance_logs")
                .insert(insertData);

            insertError = fallbackInsert.error;
        }

        if (insertError) {
            console.error("Manual Check-In Insert Error:", insertError);
            return { error: `Database error: ${insertError.message || insertError.details || "Could not complete manual check-in."}` };
        }

        revalidatePath("/admin/sessions");
        revalidatePath("/admin/history");
        revalidatePath("/admin");
        revalidatePath("/dashboard");

        return { success: true };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export interface CheckedInWorker {
    id: string;
    userId: string;
    firstName: string;
    lastName: string;
    workerId: string | null;
    avatarUrl: string | null;
    department: string;
    team: string;
    checkInTime: string;
    isManual: boolean;
    checkInNote: string | null;
}

export interface DepartmentGroup {
    department: string;
    team: string;
    count: number;
    workers: CheckedInWorker[];
}

export interface MinistryGroup {
    team: string;
    count: number;
    departments: DepartmentGroup[];
}

export async function getDepartmentAttendanceBreakdown(targetSessionId?: string) {
    try {
        const { supabase } = await verifyAdminServer();

        let activeSessionId = targetSessionId;

        if (!activeSessionId) {
            const { data: session } = await supabase
                .from("attendance_sessions")
                .select("id")
                .eq("status", "active")
                .limit(1)
                .maybeSingle();

            if (session) {
                activeSessionId = session.id;
            }
        }

        if (!activeSessionId) {
            return { data: { totalCheckedIn: 0, ministries: [] as MinistryGroup[] } };
        }

        const { data: logs, error: logsError } = await supabase
            .from("attendance_logs")
            .select(`
                id,
                user_id,
                session_id,
                department,
                team,
                check_in_time,
                is_manual,
                check_in_note,
                status
            `)
            .eq("session_id", activeSessionId)
            .eq("status", "active")
            .order("check_in_time", { ascending: false });

        if (logsError) {
            console.error("Error fetching breakdown logs:", logsError);
            return { error: "Failed to fetch attendance breakdown." };
        }

        if (!logs || logs.length === 0) {
            return { data: { totalCheckedIn: 0, ministries: [] as MinistryGroup[] } };
        }

        const userIds = Array.from(new Set(logs.map(l => l.user_id)));

        let profilesQuery = supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url, worker_id, department, team")
            .in("id", userIds);

        let { data: profiles, error: profileErr } = await profilesQuery;

        if (profileErr && (profileErr.code === '42703' || profileErr.message?.toLowerCase().includes('worker_id'))) {
            const fallbackQuery = supabase
                .from("profiles")
                .select("id, first_name, last_name, avatar_url, department, team")
                .in("id", userIds);

            const fb = await fallbackQuery;
            profiles = (fb.data || []).map((p: any) => ({ ...p, worker_id: null }));
        }

        const profileMap = new Map((profiles || []).map(p => [p.id, p]));

        const checkedInWorkers: CheckedInWorker[] = logs.map(log => {
            const prof = profileMap.get(log.user_id);
            const dept = log.department || prof?.department || "General";
            const teamName = log.team || prof?.team || "GENERAL";
            return {
                id: log.id,
                userId: log.user_id,
                firstName: prof?.first_name || "Worker",
                lastName: prof?.last_name || "",
                workerId: prof?.worker_id || null,
                avatarUrl: prof?.avatar_url || null,
                department: dept,
                team: (teamName || "GENERAL").trim().toUpperCase(),
                checkInTime: log.check_in_time,
                isManual: !!log.is_manual,
                checkInNote: log.check_in_note || null,
            };
        });

        const ministryMap = new Map<string, Map<string, CheckedInWorker[]>>();

        for (const worker of checkedInWorkers) {
            const mKey = worker.team || "GENERAL";
            const dKey = worker.department || "General";

            if (!ministryMap.has(mKey)) {
                ministryMap.set(mKey, new Map());
            }
            const deptMap = ministryMap.get(mKey)!;
            if (!deptMap.has(dKey)) {
                deptMap.set(dKey, []);
            }
            deptMap.get(dKey)!.push(worker);
        }

        const knownTeamOrder = ["PROGRAMS", "MINISTRY", "MATURITY", "MEMBERSHIP", "MISSIONS", "NEXT GEN", "GENERAL"];
        const presentTeams = Array.from(ministryMap.keys());
        const sortedTeams = knownTeamOrder.filter(t => presentTeams.includes(t));
        presentTeams.forEach(t => {
            if (!sortedTeams.includes(t)) sortedTeams.push(t);
        });

        const ministries: MinistryGroup[] = sortedTeams.map(teamName => {
            const deptMap = ministryMap.get(teamName)!;
            let teamCount = 0;
            const departments: DepartmentGroup[] = [];

            deptMap.forEach((workers, department) => {
                teamCount += workers.length;
                departments.push({
                    department,
                    team: teamName,
                    count: workers.length,
                    workers,
                });
            });

            departments.sort((a, b) => a.department.localeCompare(b.department));

            return {
                team: teamName,
            count: teamCount,
                departments,
            };
        });

        return {
            data: {
                totalCheckedIn: checkedInWorkers.length,
                ministries,
            }
        };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export interface AnalyticsData {
    totalCheckIns: number;
    selfGpsCheckIns: number;
    proxyCheckIns: number;
    gpsRatePercent: number;
    activeSessionsCount: number;
    totalWorkersCount: number;
    ministryTurnout: { team: string; count: number; percentage: number }[];
    topDepartments: { department: string; team: string; count: number }[];
    latestSessionSummary: {
        title: string;
        date: string;
        totalCheckedIn: number;
    } | null;
    attendanceTrends: {
        session_date: string;
        title: string;
        attendance: number;
    }[];
}

export async function getAttendanceAnalytics() {
    try {
        const { supabase } = await verifyAdminServer();

        const { data, error } = await supabase.rpc('get_attendance_analytics');

        if (error) {
            console.error("Analytics RPC error full:", JSON.stringify(error, null, 2));
            console.error("Analytics RPC error object:", error);
            return { error: error.message || "Failed to fetch analytics from database." };
        }

        // The RPC returns a JSON object matching AnalyticsData shape
        const analytics: AnalyticsData = {
            totalCheckIns: data?.totalCheckIns ?? 0,
            selfGpsCheckIns: data?.selfGpsCheckIns ?? 0,
            proxyCheckIns: data?.proxyCheckIns ?? 0,
            gpsRatePercent: data?.gpsRatePercent ?? 0,
            activeSessionsCount: data?.activeSessionsCount ?? 0,
            totalWorkersCount: data?.totalWorkersCount ?? 0,
            ministryTurnout: data?.ministryTurnout ?? [],
            topDepartments: data?.topDepartments ?? [],
            latestSessionSummary: data?.latestSessionSummary ?? null,
            attendanceTrends: data?.attendanceTrends ?? [],
        };

        return { data: analytics };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

