// Shared rules for the optional "Stay Connected" section of the Workers Ball form.
// People first choose whether they'd like to connect and hear about opportunities.
// Only if they say yes do we ask what they do and what they enjoy.
// Used by the form (to know when it's complete) and the server (to validate and clean it).

import { z } from "zod";

export const OCCUPATION_STAGES = ["employed", "business", "job_seeking", "schooling", "serving", "retired", "other"] as const;
export type OccupationStage = (typeof OCCUPATION_STAGES)[number];

export const SCHOOL_LEVELS = ["secondary", "undergraduate", "postgraduate", "vocational"] as const;
export type SchoolLevel = (typeof SCHOOL_LEVELS)[number];

export const INTERESTS = [
    "football", "basketball", "fitness", "music", "singing", "dancing", "reading", "writing",
    "cooking", "gaming", "movies", "travel", "photography", "tech", "fashion", "art",
    "chess", "volunteering", "business",
] as const;
export type Interest = (typeof INTERESTS)[number];

export type Occupation = {
    /** undefined = not answered yet, false = "Not now", true = "Yes, count me in" */
    optIn?: boolean;
    stages: OccupationStage[];
    employed?:    { role?: string };
    business?:    { name?: string; about?: string; instagram?: string; otherSocial?: string; website?: string };
    job_seeking?: { lookingFor?: string; background?: string; jobOffers?: boolean };
    schooling?:   { level?: SchoolLevel; detail?: string };
    serving?:     { ppa?: string; afterService?: string; jobOffers?: boolean };
    retired?:     { formerCareer?: string; mentor?: boolean };
    other?:       { description?: string };
    interests: Interest[];
    otherInterests?: string;
};

export const EMPTY_OCCUPATION: Occupation = { stages: [], interests: [] };

const filled = (s?: string) => !!s && s.trim().length >= 2;
const answered = (b?: boolean) => typeof b === "boolean";

/** Returns a friendly message for the first missing answer, or null when the section is complete. */
export function occupationProblem(o: Occupation): string | null {
    if (!answered(o.optIn)) return "Let us know if you'd like to connect with other workers.";
    if (!o.optIn) return null;
    if (o.stages.length === 0) return "Tell us what you do currently.";
    for (const s of o.stages) {
        switch (s) {
            case "employed":
                if (!filled(o.employed?.role)) return "Tell us what you do at work.";
                break;
            case "business":
                if (!filled(o.business?.about)) return "Tell us what your business does.";
                break;
            case "job_seeking":
                if (!filled(o.job_seeking?.lookingFor)) return "Tell us the kind of job you're looking for.";
                if (!answered(o.job_seeking?.jobOffers)) return "Let us know if you'd like us to send you job openings.";
                break;
            case "schooling":
                if (!o.schooling?.level) return "Choose your level in school.";
                if (!filled(o.schooling?.detail)) return "Tell us your class or year and what you're studying.";
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
    optIn: z.boolean().optional(),
    stages: z.array(z.enum(OCCUPATION_STAGES)).max(OCCUPATION_STAGES.length).default([]),
    employed:    z.object({ role: text(100) }).optional(),
    business:    z.object({ name: text(100), about: text(150), instagram, otherSocial: text(60), website }).optional(),
    job_seeking: z.object({ lookingFor: text(150), background: text(150), jobOffers: yesNo }).optional(),
    schooling:   z.object({ level: z.enum(SCHOOL_LEVELS).optional(), detail: text(150) }).optional(),
    serving:     z.object({ ppa: text(150), afterService: text(150), jobOffers: yesNo }).optional(),
    retired:     z.object({ formerCareer: text(150), mentor: yesNo }).optional(),
    other:       z.object({ description: text(150) }).optional(),
    interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length).default([]),
    otherInterests: text(150),
});

export type OccupationSummary = {
    /** null when the person chose "Not now" */
    occupation: Occupation | null;
    stages: OccupationStage[];
    interests: Interest[];
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
        return { error: custom ?? "Please check the “Stay Connected” section." };
    }

    const d = parsed.data;
    if (d.optIn === undefined) return { error: "Let us know if you'd like to connect with other workers." };

    // "Not now" — keep nothing
    if (!d.optIn) {
        return { data: { occupation: null, stages: [], interests: [], wantsToConnect: false, wantsJobOffers: false, openToMentoring: false } };
    }

    const stages = Array.from(new Set(d.stages));
    const interests = Array.from(new Set(d.interests));
    const occupation: Occupation = { optIn: true, stages, interests };
    if (d.otherInterests) occupation.otherInterests = d.otherInterests;
    for (const s of stages) {
        // Only keep answers for the stages that are actually selected
        (occupation as Record<string, unknown>)[s] = d[s] ?? {};
    }

    const problem = occupationProblem(occupation);
    if (problem) return { error: problem };

    return {
        data: {
            occupation,
            stages,
            interests,
            wantsToConnect: true,
            wantsJobOffers: occupation.job_seeking?.jobOffers === true || occupation.serving?.jobOffers === true,
            openToMentoring: occupation.retired?.mentor === true,
        },
    };
}
