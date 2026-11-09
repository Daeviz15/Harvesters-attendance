// Shared rules for the "What do you do currently?" section.
// Used by the form (to know when it's complete) and the server (to validate and clean it).

import { z } from "zod";

export const OCCUPATION_STAGES = ["employed", "business", "job_seeking", "schooling", "serving", "retired", "other"] as const;
export type OccupationStage = (typeof OCCUPATION_STAGES)[number];

export const SCHOOL_LEVELS = ["secondary", "undergraduate", "postgraduate", "vocational"] as const;
export type SchoolLevel = (typeof SCHOOL_LEVELS)[number];

export type Occupation = {
    stages: OccupationStage[];
    employed?:    { role?: string; industry?: string; connect?: boolean };
    business?:    { name?: string; about?: string; instagram?: string; otherSocial?: string; website?: string; connect?: boolean };
    job_seeking?: { lookingFor?: string; background?: string; jobOffers?: boolean; connect?: boolean };
    schooling?:   { level?: SchoolLevel; detail?: string; connect?: boolean };
    serving?:     { ppa?: string; afterService?: string; jobOffers?: boolean };
    retired?:     { formerCareer?: string; mentor?: boolean };
    other?:       { description?: string; connect?: boolean };
};

export const EMPTY_OCCUPATION: Occupation = { stages: [] };

const filled = (s?: string) => !!s && s.trim().length >= 2;
const answered = (b?: boolean) => typeof b === "boolean";

/** Returns a friendly message for the first missing answer, or null when the section is complete. */
export function occupationProblem(o: Occupation): string | null {
    if (o.stages.length === 0) return "Tell us what you do currently.";
    for (const s of o.stages) {
        switch (s) {
            case "employed":
                if (!filled(o.employed?.role)) return "Tell us what you do at work.";
                if (!answered(o.employed?.connect)) return "Let us know if you'd like to connect with others in your field.";
                break;
            case "business":
                if (!filled(o.business?.about)) return "Tell us what your business does.";
                if (!answered(o.business?.connect)) return "Let us know if you'd like to connect with other business owners.";
                break;
            case "job_seeking":
                if (!filled(o.job_seeking?.lookingFor)) return "Tell us the kind of job you're looking for.";
                if (!answered(o.job_seeking?.jobOffers)) return "Let us know if you'd like us to send you job openings.";
                if (!answered(o.job_seeking?.connect)) return "Let us know if you'd like to connect with workers in that field.";
                break;
            case "schooling":
                if (!o.schooling?.level) return "Choose your level in school.";
                if (!filled(o.schooling?.detail)) return "Tell us your class or year and what you're studying.";
                if (!answered(o.schooling?.connect)) return "Let us know if you'd like to connect with mentors in your field.";
                break;
            case "serving":
                if (!filled(o.serving?.ppa)) return "Tell us what you do at your PPA.";
                if (!answered(o.serving?.jobOffers)) return "Let us know if you'd like job openings after your service year.";
                break;
            case "retired":
                if (!filled(o.retired?.formerCareer)) return "Tell us what you retired from.";
                if (!answered(o.retired?.mentor)) return "Let us know if you'd be open to mentoring.";
                break;
            case "other":
                if (!filled(o.other?.description)) return "Tell us what you're doing currently.";
                if (!answered(o.other?.connect)) return "Let us know if you'd like to connect with others.";
                break;
        }
    }
    return null;
}

// ─── Server-side validation ──────────────────────────────────────────────────

const text = (max: number) => z.string().trim().max(max).optional().transform(v => (v ? v : undefined));
const yesNo = z.boolean().optional();

/** Instagram handles: letters, numbers, dots and underscores, up to 30 characters. */
const instagram = z.string().trim().max(31).optional()
    .transform(v => (v ? v.replace(/^@/, "") : undefined))
    .refine(v => !v || /^[A-Za-z0-9._]{1,30}$/.test(v), "That Instagram handle doesn't look right.");

/** Website: plain domain or http(s) link only; stored as an https:// link. */
const website = z.string().trim().max(200).optional()
    .transform(v => (v ? v : undefined))
    .refine(v => !v || /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s]*)?$/i.test(v), "That website link doesn't look right.")
    .transform(v => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v));

const occupationSchema = z.object({
    stages: z.array(z.enum(OCCUPATION_STAGES)).min(1).max(OCCUPATION_STAGES.length),
    employed:    z.object({ role: text(100), industry: text(100), connect: yesNo }).optional(),
    business:    z.object({ name: text(100), about: text(150), instagram, otherSocial: text(60), website, connect: yesNo }).optional(),
    job_seeking: z.object({ lookingFor: text(150), background: text(150), jobOffers: yesNo, connect: yesNo }).optional(),
    schooling:   z.object({ level: z.enum(SCHOOL_LEVELS).optional(), detail: text(150), connect: yesNo }).optional(),
    serving:     z.object({ ppa: text(150), afterService: text(150), jobOffers: yesNo }).optional(),
    retired:     z.object({ formerCareer: text(150), mentor: yesNo }).optional(),
    other:       z.object({ description: text(150), connect: yesNo }).optional(),
});

export type OccupationSummary = {
    occupation: Occupation;
    stages: OccupationStage[];
    wantsToConnect: boolean;
    wantsJobOffers: boolean;
    openToMentoring: boolean;
};

/** Validates the JSON sent by the form and keeps only the answers for the stages picked. */
export function parseOccupation(raw: unknown): { data: OccupationSummary } | { error: string } {
    let json: unknown;
    try {
        json = typeof raw === "string" ? JSON.parse(raw) : null;
    } catch {
        json = null;
    }
    const parsed = occupationSchema.safeParse(json);
    if (!parsed.success) {
        const custom = parsed.error.issues.find(i => i.code === "custom")?.message;
        return { error: custom ?? "Please tell us what you do currently." };
    }

    const stages = Array.from(new Set(parsed.data.stages));
    const occupation: Occupation = { stages };
    for (const s of stages) {
        // Only keep answers for the stages that are actually selected
        (occupation as Record<string, unknown>)[s] = parsed.data[s] ?? {};
    }

    const problem = occupationProblem(occupation);
    if (problem) return { error: problem };

    return {
        data: {
            occupation,
            stages,
            wantsToConnect: [occupation.employed?.connect, occupation.business?.connect, occupation.job_seeking?.connect,
                occupation.schooling?.connect, occupation.other?.connect].some(v => v === true),
            wantsJobOffers: occupation.job_seeking?.jobOffers === true || occupation.serving?.jobOffers === true,
            openToMentoring: occupation.retired?.mentor === true,
        },
    };
}
