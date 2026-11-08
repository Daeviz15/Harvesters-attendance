"use client";

import { useEffect, useRef, useState } from "react";

// iOS-style month/day wheel for birthdays (no year).
// Only real dates can be picked: the day wheel shrinks to fit the month
// (Feb → 29, Apr → 30) and the chosen day is pulled back if it no longer fits.

const ITEM_H = 40;
const VISIBLE = 5; // odd number so one row sits in the middle
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Feb 29 allowed (no year)

const GOLD = "#D4A445", GOLD_LIGHT = "#F3D27A", TEXT_SOFT = "#E8DCC4", MUTED = "#A8987C";

function ordinal(n: number) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

interface WheelProps {
    items: string[];
    index: number;
    onChange: (i: number) => void;
    label: string;
    active: boolean; // false until the user has picked something
}

function Wheel({ items, index, onChange, label, active }: WheelProps) {
    const ref = useRef<HTMLDivElement>(null);
    const settle = useRef<number | undefined>(undefined);
    const mounted = useRef(false);
    const [live, setLive] = useState(index); // row currently under the centre band, while scrolling

    // Keep the scroll position in sync when the value changes from outside (e.g. day clamped)
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const target = index * ITEM_H;
        if (Math.abs(el.scrollTop - target) > 1) {
            el.scrollTo({ top: target, behavior: mounted.current ? "smooth" : "auto" });
        }
        mounted.current = true;
    }, [index, items.length]);

    function handleScroll() {
        const el = ref.current;
        if (!el) return;
        const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)));
        setLive(i);
        window.clearTimeout(settle.current);
        settle.current = window.setTimeout(() => { if (i !== index || !active) onChange(i); }, 120);
    }

    function handleKey(e: React.KeyboardEvent) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const next = Math.max(0, Math.min(items.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)));
            onChange(next);
        }
    }

    return (
        <div
            ref={ref}
            role="spinbutton"
            aria-label={label}
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={items.length}
            aria-valuetext={active ? items[index] : "Not set"}
            tabIndex={0}
            onScroll={handleScroll}
            onKeyDown={handleKey}
            className="wab-wheel"
            style={{
                position: "relative", height: ITEM_H * VISIBLE, overflowY: "scroll", scrollSnapType: "y mandatory",
                paddingBlock: PAD, perspective: 600, outline: "none", overscrollBehavior: "contain",
                maskImage: "linear-gradient(180deg,transparent 0%,#000 30%,#000 70%,transparent 100%)",
                WebkitMaskImage: "linear-gradient(180deg,transparent 0%,#000 30%,#000 70%,transparent 100%)",
            }}
        >
            {items.map((item, i) => {
                const d = i - live;
                const centred = d === 0;
                return (
                    <div
                        key={item}
                        onClick={() => onChange(i)}
                        style={{
                            height: ITEM_H, display: "flex", alignItems: "center", justifyContent: "center",
                            scrollSnapAlign: "center", cursor: "pointer", userSelect: "none",
                            fontFamily: "var(--font-oswald,Oswald,sans-serif)", letterSpacing: ".04em",
                            fontSize: centred ? 19 : 16, fontWeight: centred ? 600 : 500,
                            color: centred ? (active ? GOLD_LIGHT : TEXT_SOFT) : MUTED,
                            opacity: Math.max(0.25, 1 - Math.abs(d) * 0.3),
                            transform: `rotateX(${Math.max(-60, Math.min(60, d * -20))}deg)`,
                            transition: "font-size .15s, color .15s",
                        }}
                    >
                        {item}
                    </div>
                );
            })}
        </div>
    );
}

interface Props {
    defaultMonth?: number | null; // 1–12
    defaultDay?: number | null;
    onValidChange?: (isSet: boolean) => void;
}

export default function BirthdayPicker({ defaultMonth = null, defaultDay = null, onValidChange }: Props) {
    const [month, setMonth] = useState<number | null>(defaultMonth);
    const [day, setDay] = useState<number | null>(defaultDay);

    const m = month ?? 1;
    const maxDay = DAYS_IN_MONTH[m - 1];
    const d = Math.min(day ?? 1, maxDay);
    const days = Array.from({ length: maxDay }, (_, i) => String(i + 1));
    const isSet = month !== null && day !== null;

    function pickMonth(i: number) {
        const newMax = DAYS_IN_MONTH[i];
        setMonth(i + 1);
        setDay(Math.min(day ?? 1, newMax));
        onValidChange?.(true);
    }

    function pickDay(i: number) {
        setDay(i + 1);
        if (month === null) setMonth(m);
        onValidChange?.(true);
    }

    return (
        <div>
            <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 4, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(212,164,69,0.2)", borderRadius: 12, padding: "0 8px" }}>
                {/* Centre selection band */}
                <div aria-hidden style={{ position: "absolute", left: 8, right: 8, top: PAD, height: ITEM_H, borderRadius: 8, background: "rgba(212,164,69,.1)", borderTop: `1px solid rgba(212,164,69,.35)`, borderBottom: `1px solid rgba(212,164,69,.35)`, pointerEvents: "none" }} />
                <Wheel label="Birthday month" items={MONTHS} index={m - 1} onChange={pickMonth} active={isSet} />
                <Wheel label="Birthday day" items={days} index={d - 1} onChange={pickDay} active={isSet} />
            </div>

            <div style={{ marginTop: 8, fontSize: 12, color: isSet ? GOLD_LIGHT : MUTED, display: "flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden>🎂</span>
                {isSet
                    ? <span>Your birthday: <strong style={{ color: GOLD }}>{ordinal(d)} {MONTHS[m - 1]}</strong></span>
                    : <span>Scroll or tap to choose your month and day</span>}
            </div>

            <input type="hidden" name="birthdayMonth" value={isSet ? m : ""} />
            <input type="hidden" name="birthdayDay" value={isSet ? d : ""} />

            <style>{`.wab-wheel::-webkit-scrollbar{display:none}.wab-wheel{scrollbar-width:none}.wab-wheel:focus-visible{box-shadow:inset 0 0 0 2px #F7D046;border-radius:8px}`}</style>
        </div>
    );
}
