import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { requireAdminAuth } from "@/lib/rbac";

function escapeCSVValue(value: any): string {
    if (value === null || value === undefined) return "";
    let str = String(value);
    
    if (/^[=+\-@]/.test(str)) {
        str = "'" + str;
    }

    if (str.includes(",") || str.includes("\"") || str.includes("\n") || str.includes("\r")) {
        str = `"${str.replace(/"/g, '""')}"`;
    }

    return str;
}

function calculateDuration(checkIn: string, checkOut: string | null): string {
    if (!checkOut) return "Ongoing";
    
    const start = new Date(checkIn).getTime();
    const end = new Date(checkOut).getTime();
    const diffMins = Math.floor((end - start) / (1000 * 60));
    
    if (diffMins < 60) return `${diffMins} mins`;
    
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
}

export async function GET(req: NextRequest) {
    try {
        // 1. Zero-Trust RBAC Verification
        const { isSuperAdmin, managedDepartmentIds } = await requireAdminAuth();
        const supabase = await createClient();

        // 2. Parse and Validate Query Parameters
        const searchParams = req.nextUrl.searchParams;
        const type = searchParams.get('type');
        const value = searchParams.get('value');
        const startDateParam = searchParams.get('startDate') || value;
        const endDateParam = searchParams.get('endDate') || value || startDateParam;
        const selectedDept = searchParams.get('department');
        const selectedTeam = searchParams.get('team');

        const tzOffsetRaw = parseInt(searchParams.get('tzOffset') || '0', 10);
        const tzOffset = Number.isFinite(tzOffsetRaw) && Math.abs(tzOffsetRaw) <= 840 ? tzOffsetRaw : 0;

        // 3. Pre-fetch worker IDs for Department Heads to enforce zero-trust data isolation
        let deptWorkerIds: string[] | null = null;
        if (!isSuperAdmin) {
            const { data: deptWorkers } = await supabase
                .from('profiles')
                .select('id')
                .in('department_id', managedDepartmentIds);

            deptWorkerIds = (deptWorkers || []).map((w) => w.id);
            if (deptWorkerIds.length === 0) {
                deptWorkerIds = ['00000000-0000-0000-0000-000000000000'];
            }
        }

        // 4. Calculate Date Range
        let startTime = "";
        let endTime = "";

        const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

        if ((type === 'date' || type === 'range') && (startDateParam || endDateParam)) {
            const sDate = startDateParam || endDateParam;
            const eDate = endDateParam || startDateParam;

            if (sDate && !DATE_REGEX.test(sDate)) {
                return NextResponse.json({ error: "Invalid start date format. Expected YYYY-MM-DD." }, { status: 400 });
            }
            if (eDate && !DATE_REGEX.test(eDate)) {
                return NextResponse.json({ error: "Invalid end date format. Expected YYYY-MM-DD." }, { status: 400 });
            }

            const localStart = new Date(`${sDate}T00:00:00.000`);
            const localEnd = new Date(`${eDate}T23:59:59.999`);

            if (isNaN(localStart.getTime()) || isNaN(localEnd.getTime())) {
                return NextResponse.json({ error: "Invalid date values provided." }, { status: 400 });
            }

            const startUtc = new Date(localStart.getTime() + tzOffset * 60000);
            startTime = startUtc.toISOString();

            const endUtc = new Date(localEnd.getTime() + tzOffset * 60000);
            endTime = endUtc.toISOString();
        }

        // 5. Generate CSV Headers
        const headers = [
            "Worker Name",
            "Phone Number",
            "Team",
            "Department",
            "Event/Session",
            "Check-in Time",
            "Check-out Time",
            "Status",
            "Duration"
        ];

        let csvContent = headers.map(escapeCSVValue).join(",") + "\n";

        // 6. Batch Fetching for High Performance & Scalability
        const PAGE_SIZE = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            let query = supabase
                .from('attendance_logs')
                .select(`
                    id,
                    user_id,
                    check_in_time,
                    check_out_time,
                    status,
                    department,
                    team,
                    session:attendance_sessions (
                        event:events (title)
                    )
                `)
                .order('check_in_time', { ascending: false })
                .range(offset, offset + PAGE_SIZE - 1);

            // Zero-Trust Isolation: Department Heads only export logs for their department workers
            if (!isSuperAdmin && deptWorkerIds) {
                query = query.in('user_id', deptWorkerIds);
            }

            if ((type === 'date' || type === 'range') && (startDateParam || endDateParam)) {
                query = query
                    .gte('check_in_time', startTime)
                    .lte('check_in_time', endTime);
            } else if (type === 'session' && value) {
                query = query.eq('session_id', value);
            }

            if (selectedDept && selectedDept !== 'all') {
                query = query.eq('department', selectedDept);
            }

            if (selectedTeam && selectedTeam !== 'all') {
                query = query.eq('team', selectedTeam);
            }

            const { data: logs, error: dbError } = await query;

            if (dbError) {
                console.error("Export DB Error:", dbError);
                return NextResponse.json({ error: "Failed to fetch attendance data" }, { status: 500 });
            }

            if (!logs || logs.length === 0) {
                hasMore = false;
                break;
            }

            const userIds = Array.from(new Set(logs.map(log => log.user_id)));
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, team, phone')
                .in('id', userIds);

            const profilesMap: Record<string, { first_name: string | null; last_name: string | null; team: string | null; phone: string | null }> = {};
            if (profiles) {
                for (const p of profiles) {
                    profilesMap[p.id] = p;
                }
            }

            for (const log of logs) {
                const prof = profilesMap[log.user_id];
                const sess = Array.isArray(log.session) ? log.session[0] : log.session;
                const event = sess?.event ? (Array.isArray(sess.event) ? sess.event[0] : sess.event) : null;

                const row = [
                    `${prof?.first_name || ''} ${prof?.last_name || ''}`.trim() || "Unknown",
                    prof?.phone || "N/A",
                    prof?.team || "N/A",
                    log.department || "N/A",
                    event?.title || "Unknown Event",
                    log.check_in_time ? new Date(log.check_in_time).toLocaleString('en-US') : "N/A",
                    log.check_out_time ? new Date(log.check_out_time).toLocaleString('en-US') : "N/A",
                    log.status || "Unknown",
                    calculateDuration(log.check_in_time, log.check_out_time)
                ];

                csvContent += row.map(escapeCSVValue).join(",") + "\n";
            }

            if (logs.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                offset += PAGE_SIZE;
            }
        }

        const finalEnd = endDateParam || startDateParam;
        let filename = `attendance-all-${new Date().toISOString().split('T')[0]}.csv`;
        
        if ((type === 'date' || type === 'range') && startDateParam) {
            filename = startDateParam === finalEnd 
                ? `attendance-${startDateParam}.csv` 
                : `attendance-${startDateParam}-to-${finalEnd}.csv`;
        } else if (type === 'session' && value) {
            filename = `attendance-session-${value}.csv`;
        }

        return new NextResponse(csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });

    } catch (error) {
        console.error("Export API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
