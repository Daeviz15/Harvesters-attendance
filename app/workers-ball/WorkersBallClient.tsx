"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { registerForWorkersBall, type RegisterState } from "./actions";
import AttendFlyer from "./AttendFlyer";
import BirthdayPicker from "./BirthdayPicker";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Department { id: string; name: string; team: string; teamId: string | null }
interface InitialData {
    email: string; firstName: string; lastName: string; phone: string; departmentId: string; avatarUrl: string | null;
    birthdayMonth: number | null; birthdayDay: number | null;
}
interface ExistingRegistration {
    registration_id: string;
    attendance_code: string | null;
    first_name: string;
    last_name: string | null;
    department: string;
    photo_url: string | null;
}
interface Props {
    fontVars: string;
    departments: Department[];
    initialData: InitialData | null;
    isLoggedIn: boolean;
    existingRegistration: ExistingRegistration | null;
}

// ─── Photo helper ─────────────────────────────────────────────────────────────
/** Resizes a photo to max 800px and re-encodes as JPEG so uploads stay small. */
function shrinkImage(file: File, max = 800): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new window.Image();
        img.onload = () => {
            const scale = Math.min(1, max / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Could not process image"))), "image/jpeg", 0.85);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
        img.src = url;
    });
}

// ─── Flyer backdrop (whole-site background) ───────────────────────────────────
function FlyerBackdrop() {
    return (
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
            <Image src="/ball.png" alt="" fill sizes="100vw" style={{ objectFit: "cover", objectPosition: "center 30%", filter: "blur(14px) brightness(.5) saturate(1.1)", transform: "scale(1.12)" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(10,8,6,.55) 0%,rgba(10,8,6,.72) 60%,rgba(5,4,3,.88) 100%)" }} />
        </div>
    );
}

// ─── Countdown ───────────────────────────────────────────────────────────────
const EVENT_DATE = new Date("2026-11-22T16:00:00+01:00"); // 4PM WAT
function useCountdown() {
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    useEffect(() => {
        function calc() {
            const diff = EVENT_DATE.getTime() - Date.now();
            if (diff <= 0) return setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
            setTimeLeft({
                days:    Math.floor(diff / 86400000),
                hours:   Math.floor((diff % 86400000) / 3600000),
                minutes: Math.floor((diff % 3600000) / 60000),
                seconds: Math.floor((diff % 60000) / 1000),
            });
        }
        calc();
        const id = setInterval(calc, 1000);
        return () => clearInterval(id);
    }, []);
    return timeLeft;
}

// ─── Design tokens (ball.json) ────────────────────────────────────────────────
const C = {
    bg:      "#0A0806", bgDeep: "#050403", bgWarm: "#1A130B",
    surface: "#15100A", surfaceEl: "#211810",
    gold:    "#D4A445", goldLight: "#F3D27A", goldGlow: "#FFE7A3",
    yellow:  "#F7D046", bronze: "#6B4A1E",
    text:    "#FFFFFF", textSoft: "#E8DCC4", textMuted: "#A8987C",
};
const goldButton  = `linear-gradient(135deg,${C.goldLight} 0%,${C.gold} 50%,${C.bronze} 100%)`;
const goldText    = `linear-gradient(180deg,${C.goldGlow} 0%,${C.goldLight} 40%,${C.gold} 70%,${C.bronze} 100%)`;
const spotlight   = `radial-gradient(ellipse 55% 65% at 50% 0%,rgba(255,231,163,.55) 0%,rgba(212,164,69,.2) 40%,rgba(10,8,6,0) 80%)`;
const borderGold  = `rgba(212,164,69,0.5)`;

// ─── Shared motion variants ───────────────────────────────────────────────────
const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16,1,0.3,1] as const } } };

// ─── Gold divider ─────────────────────────────────────────────────────────────
function GoldDivider() {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 auto", maxWidth: 320 }}>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,transparent,${C.gold})` }} />
            <span style={{ color: C.gold, fontSize: 10 }}>✦</span>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${C.gold},transparent)` }} />
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WorkersBallClient({ fontVars, departments, initialData, isLoggedIn, existingRegistration }: Props) {
    const shouldReduceMotion = useReducedMotion();
    const countdown = useCountdown();

    const [state, formAction, isPending] = useActionState<RegisterState, FormData>(registerForWorkersBall, null);
    const [partner, setPartner] = useState("no");
    const [presents, setPresents] = useState("no");
    const [selectedTeam, setSelectedTeam] = useState<string | null>(
        initialData?.departmentId ? (departments.find(d => d.id === initialData.departmentId)?.team ?? null) : null
    );
    const [deptId, setDeptId] = useState(initialData?.departmentId ?? "");
    const formRef = useRef<HTMLDivElement>(null);

    // Photo for the shareable flyer (shrunk on the device before upload)
    const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [photoBusy, setPhotoBusy] = useState(false);
    const shownPhoto = photoPreview ?? initialData?.avatarUrl ?? null;
    const [birthdaySet, setBirthdaySet] = useState(!!(initialData?.birthdayMonth && initialData?.birthdayDay));
    const canSubmit = !isPending && !!deptId && !photoBusy && birthdaySet;

    async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) { setPhotoError("Please choose an image file."); return; }
        if (file.size > 15 * 1024 * 1024) { setPhotoError("That image is too large (max 15MB)."); return; }
        setPhotoError(null);
        setPhotoBusy(true);
        try {
            const blob = await shrinkImage(file);
            setPhotoBlob(blob);
            setPhotoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
        } catch {
            setPhotoError("We couldn't read that image. Try a JPEG or PNG photo.");
        } finally {
            setPhotoBusy(false);
        }
    }

    function submitRegistration(fd: FormData) {
        if (photoBlob) fd.set("photo", new File([photoBlob], "photo.jpg", { type: "image/jpeg" }));
        formAction(fd);
    }

    const knownOrder = ["PROGRAMS","MINISTRY","MATURITY","MEMBERSHIP","MISSIONS","NEXT GEN","GENERAL"];
    const teams = Array.from(new Set(departments.map(d => d.team.trim().toUpperCase())));
    const sortedTeams = [...knownOrder.filter(t => teams.includes(t)), ...teams.filter(t => !knownOrder.includes(t))];
    const filteredDepts = selectedTeam ? departments.filter(d => d.team.trim().toUpperCase() === selectedTeam) : [];

    function scrollToForm() {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Input / select shared styles
    const inputStyle: React.CSSProperties = {
        width: "100%", background: "rgba(255,255,255,0.03)", border: `1px solid rgba(212,164,69,0.2)`,
        borderRadius: 8, padding: "12px 16px", color: C.textSoft, fontSize: 15, outline: "none",
        fontFamily: "var(--font-body,Inter,system-ui,sans-serif)", boxSizing: "border-box",
        colorScheme: "dark", // native dropdown lists render dark, so options stay readable
    };
    const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 };
    const fieldStyle: React.CSSProperties = { marginBottom: 20 };
    const sectionHeadStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: C.gold, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16, borderBottom: `1px solid rgba(212,164,69,0.15)`, paddingBottom: 8 };

    // ── Already registered view ──────────────────────────────────────────────
    const alreadyReg = existingRegistration;
    if (alreadyReg && !state?.success) {
        return (
            <main className={fontVars} style={{ position: "relative", minHeight: "100vh", background: C.bg, color: C.text, display: "flex", flexDirection: "column", alignItems: "center", gap: "2.5rem", padding: "2.5rem 1rem 4rem" }}>
                <FlyerBackdrop />
                <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 440, background: C.surface, border: `1px solid ${borderGold}`, borderRadius: 16, padding: "2rem", textAlign: "center", boxShadow: "0 20px 40px rgba(0,0,0,.5)" }}>
                    <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(212,164,69,.1)", border: `1px solid ${borderGold}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Already Registered</div>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: "0 0 .75rem" }}>You&apos;re on the guest list!</h2>
                    <p style={{ color: C.textMuted, fontSize: 14, lineHeight: 1.6, marginBottom: "1.5rem" }}>Your gate pass was sent to your email. Check your inbox or spam folder.</p>
                    <div style={{ background: C.bgWarm, border: `1px solid rgba(212,164,69,.2)`, borderRadius: 10, padding: "1rem", textAlign: "left", marginBottom: "1rem" }}>
                        <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Registration ID</div>
                        <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 800, color: C.gold }}>{alreadyReg.registration_id}</div>
                        {alreadyReg.attendance_code && <>
                            <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4, marginTop: 12 }}>Backup Code</div>
                            <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 800, letterSpacing: "0.3em", color: C.text }}>{alreadyReg.attendance_code}</div>
                        </>}
                    </div>
                    <p style={{ fontSize: 11, color: C.textMuted }}>Bring this gate pass on <strong style={{ color: C.textSoft }}>22nd November 2026</strong>.</p>
                </div>
                <div style={{ position: "relative", zIndex: 1, width: "100%", display: "flex", justifyContent: "center" }}>
                    <AttendFlyer firstName={alreadyReg.first_name} lastName={alreadyReg.last_name ?? ""} department={alreadyReg.department} photoUrl={alreadyReg.photo_url} />
                </div>
            </main>
        );
    }

    // ── Success view ──────────────────────────────────────────────────────────
    if (state?.success) {
        return (
            <main className={fontVars} style={{ position: "relative", minHeight: "100vh", background: C.bg, color: C.text, display: "flex", flexDirection: "column", alignItems: "center", gap: "2.5rem", padding: "2.5rem 1rem 4rem" }}>
                <FlyerBackdrop />
                <motion.div initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }} style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 440 }}>
                    <div style={{ background: C.surface, border: `1px solid ${borderGold}`, borderRadius: 16, padding: "2.5rem 2rem", textAlign: "center", boxShadow: `0 0 60px rgba(212,164,69,.12)` }}>
                        {/* Pulsing ring */}
                        <div style={{ position: "relative", width: 72, height: 72, margin: "0 auto 1.5rem" }}>
                            <motion.div animate={{ scale: [1,1.4,1], opacity: [.5,0,.5] }} transition={{ repeat: Infinity, duration: 2 }}
                                style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(212,164,69,.2)" }} />
                            <div style={{ position: "relative", width: 72, height: 72, borderRadius: "50%", background: "rgba(212,164,69,.1)", border: `2px solid ${C.gold}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            </div>
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.gold, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
                            {state.isResend ? "Gate Pass Resent" : "Registration Confirmed"}
                        </div>
                        <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 .5rem" }}>
                            {state.isResend ? `Welcome back, ${state.firstName}!` : `See you on the night, ${state.firstName}!`}
                        </h2>
                        <p style={{ color: C.textMuted, fontSize: 14, lineHeight: 1.6, marginBottom: "1.5rem" }}>
                            {state.isResend
                                ? "Your gate pass has been re-sent to your email."
                                : "Your gate pass with QR code is on its way to your inbox!"}
                        </p>
                        <div style={{ background: C.bgWarm, border: `1px solid rgba(212,164,69,.2)`, borderRadius: 12, padding: "1.25rem", textAlign: "left" }}>
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Registration ID</div>
                                <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, color: C.gold, letterSpacing: "0.1em" }}>{state.registrationId}</div>
                            </div>
                            {state.attendanceCode && (
                                <div style={{ borderTop: `1px solid rgba(212,164,69,.15)`, paddingTop: 12 }}>
                                    <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Backup Attendance Code</div>
                                    <div style={{ fontFamily: "monospace", fontSize: 36, fontWeight: 800, letterSpacing: "0.4em", color: C.text }}>{state.attendanceCode}</div>
                                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Use this if your QR cannot be scanned</div>
                                </div>
                            )}
                        </div>
                        <p style={{ fontSize: 11, color: C.textMuted, marginTop: "1rem" }}>
                            Dress code: <strong style={{ color: C.textSoft }}>Black tie / formal gala — gold accents encouraged</strong>
                        </p>
                    </div>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3 }}
                    style={{ position: "relative", zIndex: 1, width: "100%", display: "flex", justifyContent: "center" }}>
                    <AttendFlyer
                        firstName={state.firstName ?? ""}
                        lastName={state.lastName ?? ""}
                        department={state.department}
                        photoUrl={photoPreview ?? state.photoUrl ?? null}
                    />
                </motion.div>
            </main>
        );
    }

    // ── Main page ─────────────────────────────────────────────────────────────
    return (
        <main className={fontVars} style={{ position: "relative", background: C.bg, color: C.text, minHeight: "100vh", overflowX: "hidden" }}>
            <FlyerBackdrop />

            {/* ── Film-grain overlay ─────────────────────────────────────────── */}
            <div aria-hidden style={{
                position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", opacity: .05,
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                backgroundSize: "200px",
            }} />

            {/* ═══════════════════════════════════════════════════════════════
                HERO
            ════════════════════════════════════════════════════════════════ */}
            <div style={{ position: "relative", zIndex: 2 }}>
            <section className="wab-hero">
                {/* Spotlight (desktop) */}
                <div aria-hidden className="wab-desktop-only" style={{ position: "absolute", inset: 0, background: spotlight, zIndex: 0, pointerEvents: "none", ...(shouldReduceMotion ? {} : { animation: "pulse-glow 6s ease-in-out infinite" }) }} />

                {/* Mobile: the flyer itself, fading into the page */}
                <div className="wab-hero-media">
                    <Image src="/ball.png" alt="Workers Ball 2026 flyer — a couple in formal wear under a golden spotlight" fill sizes="(max-width: 959px) 100vw, 1px" loading="eager" fetchPriority="high" style={{ objectFit: "cover", objectPosition: "center top" }} />
                    <div aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg,rgba(10,8,6,0) 0%,rgba(10,8,6,0) 55%,rgba(10,8,6,.75) 78%,${C.bg} 100%)` }} />
                </div>

                {/* Desktop: logo + date badge */}
                <div className="wab-desktop-only" style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "1.5rem 4rem", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 10 }}>
                    <div style={{ position: "relative", height: 36, width: 60 }}>
                        <Image src="/logo.png" alt="Harvesters Globe" fill sizes="60px" className="object-contain" style={{ filter: "invert(1) brightness(1.2)" }} />
                    </div>
                    {/* Badge pill */}
                    <div style={{ background: C.bg, border: `2px solid ${C.gold}`, borderRadius: 999, padding: "6px 16px", boxShadow: "0 0 12px rgba(212,164,69,.35)", textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontWeight: 700, fontSize: 12, letterSpacing: "0.06em", color: C.text, textTransform: "uppercase", lineHeight: 1.1 }}>22ND NOV.</div>
                        <div style={{ fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontWeight: 700, fontSize: 12, letterSpacing: "0.06em", backgroundImage: goldText, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1.1 }}>2026 · 4PM</div>
                    </div>
                </div>

                {/* Main headline */}
                <div className="wab-hero-copy">
                    {/* Kicker on dark banner */}
                    <div style={{ display: "inline-block", padding: "6px 24px", marginBottom: ".75rem", marginLeft: -24, background: "linear-gradient(90deg,rgba(0,0,0,0) 0%,rgba(0,0,0,.85) 15%,rgba(0,0,0,.85) 85%,rgba(0,0,0,0) 100%)" }}>
                        <span style={{ fontFamily: "var(--font-archivo,'Archivo Black',sans-serif)", fontWeight: 900, fontSize: "clamp(.85rem,2.4vw,1.35rem)", letterSpacing: ".06em", textTransform: "uppercase", color: C.text }}>Harvesters Globe Ologolo</span>
                    </div>
                    <h1 style={{ margin: 0, fontFamily: "var(--font-archivo,'Archivo Black',sans-serif)", fontWeight: 900, lineHeight: .88, letterSpacing: "-.02em", textTransform: "uppercase", color: C.text }}>
                        <span style={{ display: "block", fontSize: "clamp(3.4rem,15vw,7.5rem)" }}>Workers</span>
                        <span style={{ display: "flex", alignItems: "baseline", gap: ".3em", fontSize: "clamp(3.4rem,15vw,7.5rem)" }}>
                            Ball
                            <span style={{ fontFamily: "var(--font-bebas,'Bebas Neue',sans-serif)", fontWeight: 400, fontSize: ".62em", letterSpacing: ".02em", backgroundImage: goldText, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>2026</span>
                        </span>
                    </h1>

                    {/* Tagline */}
                    <div style={{ marginTop: "1rem", fontFamily: "var(--font-playfair,'Playfair Display',serif)", fontStyle: "italic", fontSize: "clamp(.9rem,2vw,1.2rem)", color: C.goldLight }}>
                        &ldquo;An evening of light, elegance and celebration&rdquo;
                    </div>

                    {/* Event details row */}
                    <div style={{ marginTop: "1.5rem", display: "flex", flexWrap: "wrap", gap: "1.25rem", alignItems: "center" }}>
                        {[
                            { icon: "📅", label: "22ND NOV. 2026" },
                            { icon: "🕓", label: "4PM WAT" },
                            { icon: "📍", label: "HARVESTERS GLOBE OLOGOLO" },
                            { icon: "👔", label: "BLACK TIE · GOLD ACCENTS" },
                        ].map(({ icon, label }) => (
                            <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                <span style={{ fontSize: 14 }}>{icon}</span>
                                <span style={{ fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontWeight: 600, fontSize: "clamp(.7rem,1.8vw,.9rem)", letterSpacing: ".08em", textTransform: "uppercase", color: C.yellow }}>{label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Countdown */}
                    <div style={{ marginTop: "1.75rem", display: "flex", gap: 10 }}>
                        {[
                            { v: countdown.days,    l: "Days" },
                            { v: countdown.hours,   l: "Hours" },
                            { v: countdown.minutes, l: "Mins" },
                            { v: countdown.seconds, l: "Secs" },
                        ].map(({ v, l }) => (
                            <div key={l} style={{ background: C.surface, border: `1px solid rgba(212,164,69,.25)`, borderTop: `2px solid ${C.gold}`, borderRadius: 8, padding: "10px 14px", textAlign: "center", minWidth: 58, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
                                <div style={{ fontFamily: "var(--font-bebas,'Bebas Neue',sans-serif)", fontSize: "clamp(1.6rem,4vw,2.4rem)", color: "#E8E4F0", lineHeight: 1 }}>{String(v).padStart(2,"0")}</div>
                                <div style={{ fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontSize: 9, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: C.yellow, marginTop: 2 }}>{l}</div>
                            </div>
                        ))}
                    </div>

                    {/* CTA */}
                    <div style={{ marginTop: "2rem" }}>
                        <button onClick={scrollToForm} style={{ background: goldButton, border: "none", borderRadius: 999, padding: ".9rem 2.5rem", fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontWeight: 600, fontSize: 15, letterSpacing: ".08em", textTransform: "uppercase", color: C.bg, cursor: "pointer", boxShadow: "0 0 24px rgba(243,210,122,.35)", transition: "box-shadow .3s,filter .3s" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 40px rgba(243,210,122,.55)"; (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 24px rgba(243,210,122,.35)"; (e.currentTarget as HTMLButtonElement).style.filter = "none"; }}>
                            Secure Your Seat
                        </button>
                    </div>
                </div>

                {/* Desktop: the flyer as a framed poster */}
                <motion.div className="wab-hero-poster"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 30, rotate: 2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: .9, ease: [0.16,1,0.3,1] }}>
                    <Image src="/ball.png" alt="Workers Ball 2026 flyer — a couple in formal wear under a golden spotlight" fill sizes="(min-width: 960px) 440px, 1px" style={{ objectFit: "cover" }} />
                </motion.div>
            </section>

            <style>{`
                @keyframes pulse-glow{0%,100%{opacity:.85}50%{opacity:1}}
                #register select option{background:#15100A;color:#E8DCC4}
                #register select option:disabled{color:#A8987C}
                .wab-hero{position:relative;display:flex;flex-direction:column;padding:0 0 3.5rem;overflow:hidden}
                .wab-hero-media{position:relative;width:100%;max-width:640px;margin:0 auto;aspect-ratio:4/5}
                .wab-hero-copy{position:relative;z-index:2;max-width:760px;margin-top:-22vw;padding:0 1.5rem}
                .wab-hero-poster,.wab-desktop-only{display:none}
                @media (min-width:640px){.wab-hero-copy{margin-top:-140px}}
                @media (min-width:960px){
                    .wab-hero{flex-direction:row;align-items:center;justify-content:space-between;gap:4rem;min-height:100svh;max-width:1280px;margin:0 auto;padding:7rem 4rem 4rem}
                    .wab-hero-media{display:none}
                    .wab-hero-copy{margin-top:0;padding:0;flex:1;min-width:0}
                    .wab-desktop-only{display:flex}
                    .wab-hero-poster{display:block;position:relative;flex-shrink:0;width:min(440px,36vw);aspect-ratio:4/5;border-radius:14px;overflow:hidden;border:1px solid rgba(212,164,69,.55);box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 70px rgba(212,164,69,.2)}
                }
            `}</style>

            {/* ═══════════════════════════════════════════════════════════════
                REGISTRATION FORM
            ════════════════════════════════════════════════════════════════ */}
            <div ref={formRef} id="register" style={{ scrollMarginTop: 32 }}>
                <motion.section variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
                    style={{ padding: "clamp(3rem,8vw,5rem) 1.5rem", maxWidth: 680, margin: "0 auto" }}>
                    <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
                        <GoldDivider />
                        <div style={{ marginTop: "2rem", fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontSize: 11, fontWeight: 600, color: C.gold, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: ".5rem" }}>RSVP</div>
                        <h2 style={{ fontFamily: "var(--font-archivo,'Archivo Black',sans-serif)", fontWeight: 900, fontSize: "clamp(1.8rem,5vw,2.8rem)", textTransform: "uppercase", margin: "0 0 .75rem" }}>Secure Your Seat</h2>
                        <p style={{ color: C.textSoft, fontSize: ".95rem", lineHeight: 1.65 }}>
                            {isLoggedIn ? "Your details are pre-filled. Update anything that needs correcting." : "Register to receive your personal gate pass with QR code."}
                        </p>
                    </div>

                            <div>
                                <form action={submitRegistration} style={{ background: C.surface, border: `1px solid rgba(212,164,69,.25)`, borderRadius: 14, padding: "clamp(1.5rem,5vw,2.5rem)", boxShadow: "0 20px 40px rgba(0,0,0,.5)" }}>

                                    {state?.error && (
                                        <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", color: "#fca5a5", borderRadius: 8, padding: "12px 16px", fontSize: 14, marginBottom: 24 }}>
                                            {state.error}
                                        </div>
                                    )}

                                    {/* ── Personal Details ── */}
                                    <div style={sectionHeadStyle}>Personal Details</div>

                                    {/* Photo */}
                                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                                        <div style={{ position: "relative", width: 76, height: 76, flexShrink: 0, borderRadius: "50%", overflow: "hidden", border: `2px solid ${shownPhoto ? C.gold : "rgba(212,164,69,.3)"}`, background: C.bgWarm, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: shownPhoto ? "0 0 18px rgba(212,164,69,.3)" : "none" }}>
                                            {shownPhoto ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={shownPhoto} alt="Your photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                            ) : (
                                                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.1a7.5 7.5 0 0115 0A17.9 17.9 0 0112 21.75c-2.68 0-5.22-.58-7.5-1.65z"/></svg>
                                            )}
                                            {photoBusy && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: C.goldLight }}>…</div>}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <label style={{ display: "inline-block", border: `1.5px solid ${C.gold}`, color: C.goldLight, borderRadius: 999, padding: "7px 16px", fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontWeight: 600, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>
                                                {shownPhoto ? "Change Photo" : "Add Your Photo"}
                                                <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
                                            </label>
                                            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, lineHeight: 1.5 }}>
                                                Optional — we&apos;ll put it on your shareable <span style={{ color: C.goldLight }}>&ldquo;I will be attending&rdquo;</span> flyer.
                                            </div>
                                            {photoError && <div style={{ fontSize: 12, color: "#fca5a5", marginTop: 4 }}>{photoError}</div>}
                                        </div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                                        <div>
                                            <label style={labelStyle}>First Name <span style={{ color: "#f87171" }}>*</span></label>
                                            <input type="text" name="firstName" required defaultValue={initialData?.firstName ?? ""} placeholder="e.g. David" style={inputStyle} />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Last Name</label>
                                            <input type="text" name="lastName" defaultValue={initialData?.lastName ?? ""} placeholder="e.g. Oyetade" style={inputStyle} />
                                        </div>
                                    </div>

                                    <div style={fieldStyle}>
                                        <label style={labelStyle}>Email Address <span style={{ color: "#f87171" }}>*</span></label>
                                        <input type="email" name="email" required defaultValue={initialData?.email ?? ""}
                                            readOnly={isLoggedIn} placeholder="you@example.com"
                                            style={{ ...inputStyle, opacity: isLoggedIn ? .6 : 1, cursor: isLoggedIn ? "not-allowed" : "text" }} />
                                    </div>

                                    <div style={fieldStyle}>
                                        <label style={labelStyle}>WhatsApp Phone <span style={{ color: "#f87171" }}>*</span></label>
                                        <div style={{ display: "flex", border: `1px solid rgba(212,164,69,.2)`, borderRadius: 8, overflow: "hidden" }}>
                                            <span style={{ padding: "12px 14px", background: "rgba(212,164,69,.08)", color: C.textMuted, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", borderRight: `1px solid rgba(212,164,69,.2)` }}>+234</span>
                                            <input type="tel" name="phone" required pattern="[0-9]{10}" maxLength={10} defaultValue={initialData?.phone ?? ""}
                                                placeholder="8012345678" style={{ ...inputStyle, border: "none", borderRadius: 0, flex: 1 }} />
                                        </div>
                                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 5 }}>10-digit Nigerian number</div>
                                    </div>

                                    {/* Birthday */}
                                    <div style={fieldStyle}>
                                        <label style={labelStyle}>Birthday (Month &amp; Day) <span style={{ color: "#f87171" }}>*</span></label>
                                        <BirthdayPicker
                                            defaultMonth={initialData?.birthdayMonth ?? null}
                                            defaultDay={initialData?.birthdayDay ?? null}
                                            onValidChange={setBirthdaySet}
                                        />
                                    </div>

                                    {/* ── Service Team ── */}
                                    <div style={{ ...sectionHeadStyle, marginTop: 28 }}>Ministry Team &amp; Department</div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                                        <div>
                                            <label style={labelStyle}>Ministry Team <span style={{ color: "#f87171" }}>*</span></label>
                                            <div style={{ position: "relative" }}>
                                                <select value={selectedTeam ?? ""} onChange={e => { setSelectedTeam(e.target.value || null); setDeptId(""); }}
                                                    style={{ ...inputStyle, appearance: "none", paddingRight: 36 }}>
                                                    <option value="" disabled>Select team</option>
                                                    {sortedTeams.map(t => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
                                                </select>
                                                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.textMuted, fontSize: 12 }}>▾</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Department <span style={{ color: "#f87171" }}>*</span></label>
                                            <div style={{ position: "relative" }}>
                                                <select name="departmentId" required disabled={!selectedTeam} value={deptId} onChange={e => setDeptId(e.target.value)}
                                                    style={{ ...inputStyle, appearance: "none", paddingRight: 36, opacity: !selectedTeam ? .4 : 1, cursor: !selectedTeam ? "not-allowed" : "default" }}>
                                                    <option value="" disabled>{selectedTeam ? "Select dept" : "Select team first"}</option>
                                                    {filteredDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                </select>
                                                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.textMuted, fontSize: 12 }}>▾</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── Event Details ── */}
                                    <div style={{ ...sectionHeadStyle, marginTop: 28 }}>For the Evening</div>

                                    <div style={fieldStyle}>
                                        <label style={labelStyle}>What are your expectations for the night? <span style={{ color: "#f87171" }}>*</span></label>
                                        <textarea name="expectations" required minLength={10} maxLength={2000} rows={4}
                                            placeholder="Tell us what you're looking forward to..."
                                            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                                    </div>

                                    {/* Partner */}
                                    <div style={fieldStyle}>
                                        <label style={labelStyle}>Attending with a partner? <span style={{ color: "#f87171" }}>*</span></label>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                            {(["yes","no"] as const).map(val => (
                                                <label key={val} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: `1px solid ${partner === val ? C.gold : "rgba(212,164,69,.2)"}`, background: partner === val ? "rgba(212,164,69,.08)" : "transparent", cursor: "pointer", transition: "all .2s" }}>
                                                    <input type="radio" name="attendingWithPartner" value={val} checked={partner === val} onChange={() => setPartner(val)} style={{ accentColor: C.gold }} />
                                                    <span style={{ fontSize: 14, fontWeight: 600, color: partner === val ? C.goldLight : C.textSoft }}>{val === "yes" ? "Yes, +1 guest" : "No, solo"}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Presentation */}
                                    <div style={fieldStyle}>
                                        <label style={labelStyle}>Would you like to make a presentation? <span style={{ color: "#f87171" }}>*</span></label>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                            {(["yes","no"] as const).map(val => (
                                                <label key={val} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: `1px solid ${presents === val ? C.gold : "rgba(212,164,69,.2)"}`, background: presents === val ? "rgba(212,164,69,.08)" : "transparent", cursor: "pointer", transition: "all .2s" }}>
                                                    <input type="radio" name="wantsToPresent" value={val} checked={presents === val} onChange={() => setPresents(val)} style={{ accentColor: C.gold }} />
                                                    <span style={{ fontSize: 14, fontWeight: 600, color: presents === val ? C.goldLight : C.textSoft }}>{val === "yes" ? "Yes" : "No"}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {presents === "yes" && (
                                            <motion.div key="pres" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden", marginBottom: 20 }}>
                                                <label style={labelStyle}>Describe your presentation idea</label>
                                                <textarea name="presentationDetails" maxLength={1000} rows={3}
                                                    placeholder="A song, poem, skit, testimony, dance..."
                                                    style={{ ...inputStyle, border: `1px solid rgba(212,164,69,.35)`, resize: "vertical" }} />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Info banner */}
                                    <div style={{ background: "rgba(212,164,69,.06)", border: `1px solid rgba(212,164,69,.2)`, borderRadius: 8, padding: "12px 16px", marginBottom: 24, fontSize: 13, color: C.textSoft, lineHeight: 1.6 }}>
                                        <strong style={{ color: C.goldLight }}>Your gate pass</strong> — a unique QR code and 5-digit backup code — will be sent to your email immediately after registering.
                                    </div>

                                    {/* Submit */}
                                    <button type="submit" disabled={!canSubmit}
                                        style={{ width: "100%", background: !canSubmit ? "rgba(212,164,69,.3)" : goldButton, border: "none", borderRadius: 999, padding: "1rem", fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontWeight: 700, fontSize: 16, letterSpacing: ".1em", textTransform: "uppercase", color: !canSubmit ? C.textMuted : C.bg, cursor: !canSubmit ? "not-allowed" : "pointer", transition: "all .3s", boxShadow: !canSubmit ? "none" : "0 0 20px rgba(212,164,69,.2)" }}>
                                        {isPending ? "Registering..." : "Register & Get Gate Pass"}
                                    </button>
                                    {!isPending && (!birthdaySet || !deptId) && (
                                        <p style={{ textAlign: "center", fontSize: 12, color: C.textMuted, marginTop: 10 }}>
                                            {!birthdaySet ? "Choose your birthday above to continue." : "Select your department above to continue."}
                                        </p>
                                    )}

                                    <p style={{ textAlign: "center", fontSize: 11, color: C.textMuted, marginTop: 12 }}>
                                        Your gate pass is personal and non-transferable.
                                    </p>
                                </form>
                            </div>
                </motion.section>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                PROGRAMME
            ════════════════════════════════════════════════════════════════ */}
            <motion.section variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
                style={{ padding: "clamp(3rem,8vw,5rem) 1.5rem", maxWidth: 680, margin: "0 auto" }}>
                <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
                    <GoldDivider />
                    <div style={{ marginTop: "2rem", fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontSize: 11, fontWeight: 600, color: C.gold, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: ".5rem" }}>Evening Programme</div>
                    <h2 style={{ fontFamily: "var(--font-archivo,'Archivo Black',sans-serif)", fontWeight: 900, fontSize: "clamp(1.8rem,5vw,3rem)", lineHeight: 1, textTransform: "uppercase" }}>The Night Ahead</h2>
                </div>
                <div style={{ position: "relative" }}>
                    {[
                        { time: "4:00 PM", title: "Arrival & Red Carpet", desc: "Make your entrance. Dress your best." },
                        { time: "4:30 PM", title: "Welcome & Opening Prayer", desc: "Setting the atmosphere for a divine evening." },
                        { time: "5:00 PM", title: "Dinner is Served", desc: "A fine dining experience curated for the night." },
                        { time: "6:30 PM", title: "Awards & Recognition", desc: "Honouring workers who have gone above and beyond." },
                        { time: "7:30 PM", title: "Entertainment & Performances", desc: "Music, presentations and unforgettable moments." },
                        { time: "9:00 PM", title: "Dance Floor Opens", desc: "The night is young — celebrate!" },
                        { time: "10:00 PM", title: "Closing & Benediction", desc: "Until next year. May your light keep shining." },
                    ].map(({ time, title, desc }, i) => (
                        <div key={i} style={{ display: "flex", gap: 20, marginBottom: 24, position: "relative" }}>
                            {/* Line */}
                            {i < 6 && <div style={{ position: "absolute", left: 56, top: 32, width: 1, height: "calc(100% + 24px)", background: `linear-gradient(${C.gold},transparent)`, opacity: .25 }} />}
                            {/* Time bubble */}
                            <div style={{ flexShrink: 0, width: 50, textAlign: "right", fontFamily: "var(--font-bebas,'Bebas Neue',sans-serif)", fontSize: 15, color: C.yellow, paddingTop: 6, letterSpacing: ".04em" }}>{time}</div>
                            {/* Dot */}
                            <div style={{ flexShrink: 0, width: 13, height: 13, borderRadius: "50%", background: C.gold, marginTop: 8, zIndex: 1, boxShadow: `0 0 10px ${C.gold}` }} />
                            {/* Content */}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontWeight: 600, fontSize: "1rem", color: C.text, textTransform: "uppercase", letterSpacing: ".04em" }}>{title}</div>
                                <div style={{ fontSize: ".875rem", color: C.textMuted, marginTop: 3, lineHeight: 1.5 }}>{desc}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.section>

            {/* ═══════════════════════════════════════════════════════════════
                ABOUT
            ════════════════════════════════════════════════════════════════ */}
            <motion.section variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
                style={{ padding: "clamp(4rem,10vw,6rem) 1.5rem", maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
                <GoldDivider />
                <div style={{ marginTop: "2.5rem" }}>
                    <div style={{ fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontSize: 11, fontWeight: 600, color: C.gold, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: ".75rem" }}>About the Evening</div>
                    <h2 style={{ fontFamily: "var(--font-archivo,'Archivo Black',sans-serif)", fontWeight: 900, fontSize: "clamp(2rem,6vw,3.5rem)", lineHeight: .95, textTransform: "uppercase", margin: "0 0 1.5rem" }}>
                        You Are the{" "}
                        <span style={{ backgroundImage: goldText, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", display: "inline-block" }}>Light</span>
                    </h2>
                    <p style={{ fontFamily: "var(--font-body,Inter,system-ui,sans-serif)", fontSize: "clamp(.95rem,2vw,1.1rem)", lineHeight: 1.75, color: C.textSoft, marginBottom: "1.25rem" }}>
                        Workers Ball is a celebration of the workers who pour their time, gifts and devotion into the Globe — those who show up faithfully to serve, in the light and in the shadows. This night is for <em style={{ color: C.goldLight }}>you</em>.
                    </p>
                    <p style={{ fontFamily: "var(--font-body,Inter,system-ui,sans-serif)", fontSize: "clamp(.95rem,2vw,1.1rem)", lineHeight: 1.75, color: C.textSoft }}>
                        Expect an extraordinary evening of recognition, worship, fine dining, awards, and moments that remind every worker: <em style={{ color: C.goldLight }}>your labour is not in vain.</em>
                    </p>
                </div>
            </motion.section>

            {/* ═══════════════════════════════════════════════════════════════
                DRESS CODE
            ════════════════════════════════════════════════════════════════ */}
            <motion.section variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
                style={{ padding: "clamp(3rem,8vw,5rem) 1.5rem", maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
                <GoldDivider />
                <div style={{ marginTop: "2rem" }}>
                    <div style={{ fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontSize: 11, fontWeight: 600, color: C.gold, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: ".5rem" }}>Dress Code</div>
                    <h2 style={{ fontFamily: "var(--font-archivo,'Archivo Black',sans-serif)", fontWeight: 900, fontSize: "clamp(1.8rem,5vw,2.8rem)", textTransform: "uppercase", margin: "0 0 1rem" }}>Black Tie</h2>
                    <p style={{ fontFamily: "var(--font-playfair,'Playfair Display',serif)", fontStyle: "italic", fontSize: "clamp(1rem,2.5vw,1.3rem)", color: C.goldLight, margin: "0 0 1.25rem" }}>
                        &ldquo;Gold accents strongly encouraged&rdquo;
                    </p>
                    <p style={{ color: C.textSoft, fontSize: ".95rem", lineHeight: 1.7, maxWidth: 480, margin: "0 auto" }}>
                        Formal gala attire for all guests. Ladies: floor-length gowns or formal cocktail dress. Gentlemen: tuxedo or dark suit with tie. Gold, champagne and ivory tones welcome.
                    </p>
                </div>
            </motion.section>

            {/* ═══════════════════════════════════════════════════════════════
                VENUE
            ════════════════════════════════════════════════════════════════ */}
            <motion.section variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
                style={{ padding: "clamp(3rem,8vw,5rem) 1.5rem", maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
                <GoldDivider />
                <div style={{ marginTop: "2rem" }}>
                    <div style={{ fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontSize: 11, fontWeight: 600, color: C.gold, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: ".5rem" }}>Venue</div>
                    <h2 style={{ fontFamily: "var(--font-archivo,'Archivo Black',sans-serif)", fontWeight: 900, fontSize: "clamp(1.6rem,4vw,2.4rem)", textTransform: "uppercase", margin: "0 0 .75rem" }}>Harvesters Globe Ologolo</h2>
                    <p style={{ color: C.textSoft, fontSize: ".95rem", lineHeight: 1.7, marginBottom: "1.5rem" }}>
                        Harvesters International Christian Centre<br />Globe Campus, Ologolo, Lekki, Lagos
                    </p>
                    {/* Map placeholder */}
                    <div style={{ background: C.surface, border: `1px solid rgba(212,164,69,.2)`, borderRadius: 14, height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 14, fontFamily: "var(--font-oswald,Oswald,sans-serif)", letterSpacing: ".06em", textTransform: "uppercase" }}>
                        📍 Map — Harvesters Globe Ologolo
                    </div>
                </div>
            </motion.section>

            {/* ═══════════════════════════════════════════════════════════════
                FOOTER
            ════════════════════════════════════════════════════════════════ */}
            <footer style={{ borderTop: `1px solid rgba(212,164,69,.12)`, padding: "2.5rem 1.5rem", textAlign: "center" }}>
                <div style={{ position: "relative", height: 32, width: 52, margin: "0 auto 1rem" }}>
                    <Image src="/logo.png" alt="Harvesters" fill sizes="52px" style={{ objectFit: "contain", filter: "invert(1) brightness(.6)" }} />
                </div>
                <p style={{ fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: C.textMuted }}>
                    Harvesters International Christian Centre &bull; Globe Ologolo
                </p>
                <p style={{ fontSize: 11, color: C.bronze, marginTop: 6 }}>
                    Workers Ball 2026 &bull; 22nd November 2026 &bull; 4PM
                </p>
            </footer>
            </div>
        </main>
    );
}
