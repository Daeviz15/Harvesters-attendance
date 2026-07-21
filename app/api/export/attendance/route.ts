import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// Escapes CSV values to prevent CSV Injection (Formula Injection) and handles commas/newlines
function escapeCSVValue(value: any): string {
    if (value === null || value === undefined) return "";
    let str = String(value);
    
    // Prevent CSV Injection
    if (/^[=+\-@]/.test(str)) {
        str = "'" + str;
    }

    // Escape quotes and wrap in quotes if it contains commas, newlines, or quotes
    if (str.includes(",") || str.includes("\"") || str.includes("\n") || str.includes("\r")) {
        str = `"${str.replace(/"/g, '""')}"`;
    }

    return str;
}

// Calculate duration in a human readable format
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
        const supabase = await createClient();

        // 1. Authenticate user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Verify Admin Role (Strict Security Check)
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (!profile || profile.role !== 'admin') {
            return NextResponse.json({ error: "Forbidden. Admin access required." }, { status: 403 });
        }

        // 3. Parse Query Parameters
        const searchParams = req.nextUrl.searchParams;
        const type = searchParams.get('type'); // 'date', 'session', 'all'
        const value = searchParams.get('value');

        const tzOffset = parseInt(searchParams.get('tzOffset') || '0', 10); // Offset in minutes

        // 4. Calculate Date Range with Timezone Safety
        let startTime = "";
        let endTime = "";

        if (type === 'date' && value) {
            // "value" is YYYY-MM-DD
            // Create a date representing midnight in the user's local timezone
            const localDate = new Date(`${value}T00:00:00.000`);
            // Adjust to UTC
            const startUtc = new Date(localDate.getTime() + tzOffset * 60000);
            startTime = startUtc.toISOString();
            
            // End of day is 23:59:59.999
            const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1);
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

        // 6. Fetch Data in Batches to bypass Supabase's default 1000 row limit (Scalability)
        const PAGE_SIZE = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            // Step A: Fetch attendance logs (with session/event join only)
            let query = supabase
                .from('attendance_logs')
                .select(`
                    id,
                    user_id,
                    check_in_time,
                    check_out_time,
                    status,
                    department,
                    session:attendance_sessions (
                        event:events (title)
                    )
                `)
                .order('check_in_time', { ascending: false })
                .range(offset, offset + PAGE_SIZE - 1);

            if (type === 'date' && value) {
                query = query
                    .gte('check_in_time', startTime)
                    .lte('check_in_time', endTime);
            } else if (type === 'session' && value) {
                query = query.eq('session_id', value);
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

            // Step B: Fetch profiles for this batch of logs
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

            // Step C: Append rows to CSV string
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

        // 6. Return standard CSV Response
        const filename = type === 'date' 
            ? `attendance-${value}.csv` 
            : type === 'session' 
                ? `attendance-session-${value}.csv` 
                : `attendance-all-${new Date().toISOString().split('T')[0]}.csv`;

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
