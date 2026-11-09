"use client";

// "Stay Connected" — an optional section at the end of the Workers Ball form.
// We first ask if the person would like to connect and hear about opportunities.
// Only if they say yes do we ask what they do (they can pick several, e.g. working
// AND running a side business) and what they enjoy.

import type { CSSProperties, ReactNode } from "react";
import {
    INTERESTS, OCCUPATION_STAGES, SCHOOL_LEVELS,
    type Interest, type Occupation, type OccupationStage, type SchoolLevel,
} from "./occupation";

const C = {
    gold: "#D4A445", goldLight: "#F3D27A", text: "#FFFFFF", textSoft: "#E8DCC4", textMuted: "#A8987C",
};

const STAGE_INFO: Record<OccupationStage, { emoji: string; label: string; hint: string }> = {
    employed:    { emoji: "💼", label: "Working",             hint: "Employed by an organisation" },
    business:    { emoji: "🚀", label: "Running a business",  hint: "Self-employed or business owner" },
    job_seeking: { emoji: "🔍", label: "Looking for a job",   hint: "Open to new opportunities" },
    schooling:   { emoji: "🎓", label: "In school",           hint: "Secondary, university or training" },
    serving:     { emoji: "🎖️", label: "Serving (NYSC)",      hint: "National Youth Service year" },
    retired:     { emoji: "🌅", label: "Retired",             hint: "Enjoying a well-earned rest" },
    other:       { emoji: "✨", label: "Something else",      hint: "Full-time parent, gap year…" },
};

const SCHOOL_LEVEL_INFO: Record<SchoolLevel, { label: string; placeholder: string }> = {
    secondary:     { label: "Secondary school",              placeholder: "e.g. SS2" },
    undergraduate: { label: "University / Polytechnic",      placeholder: "e.g. 300 Level, Mechanical Engineering" },
    postgraduate:  { label: "Masters / PhD",                 placeholder: "e.g. MSc Public Health, Year 1" },
    vocational:    { label: "Vocational / professional",     placeholder: "e.g. ICAN exams, Fashion design school" },
};

const INTEREST_INFO: Record<Interest, string> = {
    football: "⚽ Football", basketball: "🏀 Basketball", fitness: "💪 Fitness & gym", music: "🎵 Music",
    singing: "🎤 Singing", dancing: "💃 Dancing", reading: "📚 Reading", writing: "✍️ Writing",
    cooking: "🍳 Cooking & baking", gaming: "🎮 Gaming", movies: "🎬 Movies & series", travel: "✈️ Travel",
    photography: "📸 Photography", tech: "💻 Tech & gadgets", fashion: "👗 Fashion & style", art: "🎨 Art & design",
    chess: "♟️ Chess & board games", volunteering: "🤝 Volunteering", business: "📈 Business & investing",
};

interface Props {
    value: Occupation;
    onChange: (next: Occupation) => void;
    inputStyle: CSSProperties;
    labelStyle: CSSProperties;
}

export default function WhatYouDo({ value, onChange, inputStyle, labelStyle }: Props) {
    const has = (s: OccupationStage) => value.stages.includes(s);

    function toggleStage(s: OccupationStage) {
        const stages = has(s) ? value.stages.filter(x => x !== s) : [...value.stages, s];
        onChange({ ...value, stages });
    }

    function toggleInterest(i: Interest) {
        const interests = value.interests.includes(i) ? value.interests.filter(x => x !== i) : [...value.interests, i];
        onChange({ ...value, interests });
    }

    /** Updates one field inside a stage's answers. */
    function set<S extends OccupationStage>(stage: S, patch: Partial<NonNullable<Occupation[S]>>) {
        onChange({ ...value, [stage]: { ...(value[stage] ?? {}), ...patch } });
    }

    const field: CSSProperties = { marginBottom: 14 };
    const optional = <span style={{ color: C.textMuted, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}> (optional)</span>;
    const required = <span style={{ color: "#f87171" }}> *</span>;
    const chipGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 };

    return (
        <div>
            {/* The opt-in question */}
            <div style={{ background: "rgba(212,164,69,.06)", border: "1px solid rgba(212,164,69,.18)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: C.textSoft }}>
                    <strong style={{ color: C.goldLight }}>Find your people 💛</strong><br />
                    Our workers include business owners, professionals, students, corpers and retirees.
                    If you&apos;d like, we can help you connect with others, share job openings and mentoring, and invite you to hangouts
                    around things you enjoy. It&apos;s completely up to you.
                </p>
            </div>
            <YesNo label="Would you like to connect with other workers and hear about opportunities?"
                yes="Yes, count me in" no="Not now"
                value={value.optIn} onChange={v => onChange({ ...value, optIn: v })} labelStyle={labelStyle} />

            {value.optIn === false && (
                <p style={{ fontSize: 13, color: C.textMuted, margin: "-4px 0 14px" }}>
                    No problem! You can always reach out to us later. Enjoy the night ✨
                </p>
            )}

            {value.optIn && (
                <>
                    <p style={{ fontSize: 13, color: C.textSoft, margin: "0 0 14px", lineHeight: 1.6 }}>
                        Lovely! 🎉 Tell us a little about yourself so we know who to connect you with.
                    </p>

                    <label style={labelStyle}>What do you do currently?{required}</label>
                    <p style={{ fontSize: 12, color: C.textMuted, margin: "-2px 0 8px" }}>Pick everything that fits you right now.</p>
                    <div role="group" aria-label="What do you do currently?" style={{ ...chipGrid, marginBottom: 16 }}>
                        {OCCUPATION_STAGES.map(s => {
                            const on = has(s);
                            const info = STAGE_INFO[s];
                            return (
                                <button key={s} type="button" onClick={() => toggleStage(s)} aria-pressed={on}
                                    style={{
                                        position: "relative", textAlign: "left", padding: "10px 26px 10px 12px", borderRadius: 10, cursor: "pointer", transition: "all .2s",
                                        border: `1px solid ${on ? C.gold : "rgba(212,164,69,.2)"}`,
                                        background: on ? "rgba(212,164,69,.12)" : "rgba(255,255,255,.02)",
                                    }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: on ? C.goldLight : C.textSoft }}>
                                        <span aria-hidden>{info.emoji}</span> {info.label}
                                        {on && <span aria-hidden style={{ position: "absolute", top: 8, right: 10, color: C.gold }}>✓</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{info.hint}</div>
                                </button>
                            );
                        })}
                    </div>

                    {/* ── Working ── */}
                    {has("employed") && (
                        <StageCard emoji="💼" title="Nice! Tell us about your work">
                            <div style={field}>
                                <label style={labelStyle}>What do you do?{required}</label>
                                <input type="text" maxLength={100} style={inputStyle} value={value.employed?.role ?? ""}
                                    onChange={e => set("employed", { role: e.target.value })}
                                    placeholder="e.g. Accountant, Lawyer, Software Engineer, Nurse" />
                            </div>
                        </StageCard>
                    )}

                    {/* ── Business ── */}
                    {has("business") && (
                        <StageCard emoji="🚀" title="We love a builder! Tell us about your business">
                            <div style={field}>
                                <label style={labelStyle}>What does your business do?{required}</label>
                                <input type="text" maxLength={150} style={inputStyle} value={value.business?.about ?? ""}
                                    onChange={e => set("business", { about: e.target.value })}
                                    placeholder="e.g. Cakes & small chops, Interior design, Logistics" />
                            </div>
                            <div style={field}>
                                <label style={labelStyle}>Business name{optional}</label>
                                <input type="text" maxLength={100} style={inputStyle} value={value.business?.name ?? ""}
                                    onChange={e => set("business", { name: e.target.value })} placeholder="e.g. Grace Bakes" />
                            </div>
                            <div style={field}>
                                <label style={labelStyle}>Where can people find you?{optional}</label>
                                <div style={{ display: "grid", gap: 8 }}>
                                    <input type="text" maxLength={31} style={inputStyle} value={value.business?.instagram ?? ""}
                                        onChange={e => set("business", { instagram: e.target.value })}
                                        placeholder="Instagram, e.g. @gracebakes" aria-label="Instagram handle" autoCapitalize="none" />
                                    <input type="text" maxLength={60} style={inputStyle} value={value.business?.otherSocial ?? ""}
                                        onChange={e => set("business", { otherSocial: e.target.value })}
                                        placeholder="TikTok, X, Facebook or WhatsApp business" aria-label="Other social handle" autoCapitalize="none" />
                                    <input type="url" maxLength={200} style={inputStyle} value={value.business?.website ?? ""}
                                        onChange={e => set("business", { website: e.target.value })}
                                        placeholder="Website, e.g. gracebakes.com" aria-label="Website" autoCapitalize="none" inputMode="url" />
                                </div>
                            </div>
                        </StageCard>
                    )}

                    {/* ── Job seeking ── */}
                    {has("job_seeking") && (
                        <StageCard emoji="🔍" title="We're rooting for you 🙏 What are you looking for?">
                            <div style={field}>
                                <label style={labelStyle}>What kind of job are you looking for?{required}</label>
                                <input type="text" maxLength={150} style={inputStyle} value={value.job_seeking?.lookingFor ?? ""}
                                    onChange={e => set("job_seeking", { lookingFor: e.target.value })}
                                    placeholder="e.g. Entry-level accounting, Frontend developer, Admin officer" />
                            </div>
                            <div style={field}>
                                <label style={labelStyle}>Your field, skills or qualification{optional}</label>
                                <input type="text" maxLength={150} style={inputStyle} value={value.job_seeking?.background ?? ""}
                                    onChange={e => set("job_seeking", { background: e.target.value })}
                                    placeholder="e.g. B.Sc Economics, 2 years in customer service" />
                            </div>
                            <YesNo label="Would you like us to send you job openings we come across?"
                                value={value.job_seeking?.jobOffers} onChange={v => set("job_seeking", { jobOffers: v })} labelStyle={labelStyle} />
                        </StageCard>
                    )}

                    {/* ── Schooling ── */}
                    {has("schooling") && (
                        <StageCard emoji="🎓" title="Keep learning! Tell us about your studies">
                            <div style={field}>
                                <label style={labelStyle}>What level are you in?{required}</label>
                                <div style={chipGrid}>
                                    {SCHOOL_LEVELS.map(l => {
                                        const on = value.schooling?.level === l;
                                        return (
                                            <button key={l} type="button" aria-pressed={on} onClick={() => set("schooling", { level: l })}
                                                style={{ padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, textAlign: "left",
                                                    border: `1px solid ${on ? C.gold : "rgba(212,164,69,.2)"}`, background: on ? "rgba(212,164,69,.12)" : "transparent",
                                                    color: on ? C.goldLight : C.textSoft }}>
                                                {SCHOOL_LEVEL_INFO[l].label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div style={field}>
                                <label style={labelStyle}>Which class or year, and what are you studying?{required}</label>
                                <input type="text" maxLength={150} style={inputStyle} value={value.schooling?.detail ?? ""}
                                    onChange={e => set("schooling", { detail: e.target.value })}
                                    placeholder={value.schooling?.level ? SCHOOL_LEVEL_INFO[value.schooling.level].placeholder : "e.g. 200 Level, Computer Science"} />
                            </div>
                        </StageCard>
                    )}

                    {/* ── NYSC ── */}
                    {has("serving") && (
                        <StageCard emoji="🎖️" title="Corper, we see you! Tell us about your service year">
                            <div style={field}>
                                <label style={labelStyle}>What do you do at your place of primary assignment (PPA)?{required}</label>
                                <input type="text" maxLength={150} style={inputStyle} value={value.serving?.ppa ?? ""}
                                    onChange={e => set("serving", { ppa: e.target.value })}
                                    placeholder="e.g. Teaching maths at a secondary school, Admin at a bank" />
                            </div>
                            <div style={field}>
                                <label style={labelStyle}>What would you like to do after service?{optional}</label>
                                <input type="text" maxLength={150} style={inputStyle} value={value.serving?.afterService ?? ""}
                                    onChange={e => set("serving", { afterService: e.target.value })}
                                    placeholder="e.g. Work in tech, Further studies, Start a business" />
                            </div>
                            <YesNo label="Would you like us to send you job openings for after your service year?"
                                value={value.serving?.jobOffers} onChange={v => set("serving", { jobOffers: v })} labelStyle={labelStyle} />
                        </StageCard>
                    )}

                    {/* ── Retired ── */}
                    {has("retired") && (
                        <StageCard emoji="🌅" title="Thank you for your years of service!">
                            <div style={field}>
                                <label style={labelStyle}>What did you retire from?{required}</label>
                                <input type="text" maxLength={150} style={inputStyle} value={value.retired?.formerCareer ?? ""}
                                    onChange={e => set("retired", { formerCareer: e.target.value })}
                                    placeholder="e.g. 30 years in banking, Civil service, Teaching" />
                            </div>
                            <YesNo label="Would you be open to mentoring younger workers with your experience?"
                                value={value.retired?.mentor} onChange={v => set("retired", { mentor: v })} labelStyle={labelStyle} />
                        </StageCard>
                    )}

                    {/* ── Something else ── */}
                    {has("other") && (
                        <StageCard emoji="✨" title="Tell us what you're up to">
                            <div style={field}>
                                <label style={labelStyle}>What are you doing currently?{required}</label>
                                <input type="text" maxLength={150} style={inputStyle} value={value.other?.description ?? ""}
                                    onChange={e => set("other", { description: e.target.value })}
                                    placeholder="e.g. Full-time parent, Gap year, Full-time ministry" />
                            </div>
                        </StageCard>
                    )}

                    {/* ── Interests ── */}
                    <label style={{ ...labelStyle, marginTop: 6 }}>What do you enjoy?{optional}</label>
                    <p style={{ fontSize: 12, color: C.textMuted, margin: "-2px 0 8px" }}>
                        Tap any that you love. We&apos;ll use this to plan hangouts and link you up with others who enjoy the same things.
                    </p>
                    <div role="group" aria-label="What do you enjoy?" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                        {INTERESTS.map(i => {
                            const on = value.interests.includes(i);
                            return (
                                <button key={i} type="button" aria-pressed={on} onClick={() => toggleInterest(i)}
                                    style={{ padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all .2s",
                                        border: `1px solid ${on ? C.gold : "rgba(212,164,69,.2)"}`, background: on ? "rgba(212,164,69,.15)" : "transparent",
                                        color: on ? C.goldLight : C.textSoft }}>
                                    {INTEREST_INFO[i]}
                                </button>
                            );
                        })}
                    </div>
                    <div style={field}>
                        <input type="text" maxLength={150} style={inputStyle} value={value.otherInterests ?? ""}
                            onChange={e => onChange({ ...value, otherInterests: e.target.value })}
                            placeholder="Anything else? e.g. Swimming, Gardening, Comedy" aria-label="Other things you enjoy" />
                    </div>
                </>
            )}
        </div>
    );
}

function StageCard({ emoji, title, children }: { emoji: string; title: string; children: ReactNode }) {
    return (
        <div style={{ border: "1px solid rgba(212,164,69,.22)", borderLeft: `3px solid ${C.gold}`, borderRadius: 10, padding: "14px 16px 4px", marginBottom: 14, background: "rgba(255,255,255,.015)" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.goldLight, marginBottom: 12 }}><span aria-hidden>{emoji}</span> {title}</div>
            {children}
        </div>
    );
}

function YesNo({ label, value, onChange, labelStyle, yes = "Yes, please", no = "Not now" }: {
    label: string; value: boolean | undefined; onChange: (v: boolean) => void; labelStyle: CSSProperties; yes?: string; no?: string;
}) {
    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{ ...labelStyle, textTransform: "none", letterSpacing: 0, fontSize: 13, color: C.textSoft }}>{label} <span style={{ color: "#f87171" }}>*</span></div>
            <div role="radiogroup" aria-label={label} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[true, false].map(v => {
                    const on = value === v;
                    return (
                        <button key={String(v)} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
                            style={{ padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600,
                                border: `1px solid ${on ? C.gold : "rgba(212,164,69,.2)"}`, background: on ? "rgba(212,164,69,.12)" : "transparent",
                                color: on ? C.goldLight : C.textSoft }}>
                            {v ? yes : no}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
