import { SupabaseClient } from "@supabase/supabase-js";

export const TEAM_CODE_MAP: Record<string, string> = {
    "ATTRACTION": "ATR",
    "ATTRACT": "ATR",
    "MEMBERSHIP": "MEM",
    "MEMBER": "MEM",
    "MATURITY": "MAT",
    "MINISTRY": "MIN",
    "MISSIONS": "MIS",
    "MISSION": "MIS",
    "ADMINISTRATION": "ADM",
    "ADMIN": "ADM",
    "GENERAL": "ADM",
    "NEXTGEN": "NXT",
    "NEXT GEN": "NXT",
    "PROGRAMS": "PRG",
};

/**
 * Returns the 3-letter uppercase team code for a given team name.
 * Defaults to 'ADM' for general / administration.
 */
export function getTeamCode(teamName?: string | null): string {
    if (!teamName) return "ADM";
    const normalized = teamName.trim().toUpperCase();
    return TEAM_CODE_MAP[normalized] || "ADM";
}

/**
 * Generates a team-scoped sequential Worker ID in format GLOBE/{TEAM}/{YY}/{XXXX}
 * e.g., GLOBE/MIN/26/0001
 */
export async function generateTeamWorkerId(
    supabase: SupabaseClient,
    teamName?: string | null
): Promise<string> {
    const teamCode = getTeamCode(teamName);
    const yearCode = new Date().getFullYear().toString().slice(-2);
    const prefix = `GLOBE/${teamCode}/${yearCode}/`;

    // 1. Try calling Supabase RPC if function exists
    try {
        const { data: rpcId, error: rpcError } = await supabase.rpc("generate_next_worker_id", {
            p_team: teamName || "GENERAL",
        });
        if (!rpcError && rpcId && typeof rpcId === "string") {
            return rpcId;
        }
    } catch {
        // Fallback to query calculation if RPC doesn't exist
    }

    // 2. Direct Query Fallback with Concurrency Safety
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const { data: existingProfiles } = await supabase
            .from("profiles")
            .select("worker_id")
            .like("worker_id", `${prefix}%`);

        let maxSeq = 0;
        if (existingProfiles && existingProfiles.length > 0) {
            for (const p of existingProfiles) {
                if (!p.worker_id) continue;
                const seqPart = p.worker_id.replace(prefix, "").trim();
                const seqNum = parseInt(seqPart, 10);
                if (!isNaN(seqNum) && seqNum > maxSeq) {
                    maxSeq = seqNum;
                }
            }
        }

        const candidateSeq = (maxSeq + 1 + attempt).toString().padStart(4, "0");
        const candidateId = `${prefix}${candidateSeq}`;

        // Verify uniqueness
        const { data: checkCollision } = await supabase
            .from("profiles")
            .select("id")
            .eq("worker_id", candidateId)
            .maybeSingle();

        if (!checkCollision) {
            return candidateId;
        }
    }

    // Ultimate fallback if high concurrency collisions occur
    const timestampPart = Date.now().toString().slice(-4);
    return `${prefix}${timestampPart}`;
}
