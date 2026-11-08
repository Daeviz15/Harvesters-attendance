"use client";

import { useEffect, useRef, useState } from "react";

// Builds a personal "I will be attending" image on top of the official flyer
// (public/ball.png, 1024×1280) so attendees can share it on WhatsApp / Instagram.

interface Props {
    firstName: string;
    lastName?: string;
    department?: string;
    photoUrl: string | null;
}

const W = 1080;
const H = 1350; // same 4:5 ratio as the flyer
const GOLD = "#D4A445", GOLD_LIGHT = "#F3D27A", GOLD_GLOW = "#FFE7A3", BRONZE = "#6B4A1E";
const SHARE_TEXT = "I will be attending the Harvesters Globe Ologolo Workers Ball 2026! 🥂✨ 22nd November, 4PM. Register for yours:";

function loadImage(src: string, cors: boolean): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (cors) img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Could not load ${src}`));
        img.src = src;
    });
}

/** Reads a next/font family (e.g. --font-archivo) from the page so the canvas uses the same fonts. */
function cssFont(el: HTMLElement | null, varName: string, fallback: string) {
    if (!el) return fallback;
    const v = getComputedStyle(el).getPropertyValue(varName).trim();
    return v ? `${v}, ${fallback}` : fallback;
}

/** Shrinks the font until the text fits maxWidth, then draws it centred on x. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, size: number, font: (s: number) => string) {
    let s = size;
    ctx.font = font(s);
    while (ctx.measureText(text).width > maxWidth && s > 12) {
        s -= 2;
        ctx.font = font(s);
    }
    ctx.fillText(text, x, y);
}

async function drawFlyer(canvas: HTMLCanvasElement, fontEl: HTMLElement | null, p: Props): Promise<boolean> {
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    const archivo  = cssFont(fontEl, "--font-archivo", "'Arial Black', sans-serif");
    const oswald   = cssFont(fontEl, "--font-oswald", "'Arial Narrow', sans-serif");
    const playfair = cssFont(fontEl, "--font-playfair", "Georgia, serif");
    const fonts = {
        kicker: (s: number) => `600 ${s}px ${oswald}`,
        big:    (s: number) => `400 ${s}px ${archivo}`,
        name:   (s: number) => `italic 500 ${s}px ${playfair}`,
        dept:   (s: number) => `500 ${s}px ${oswald}`,
    };
    await Promise.all(Object.values(fonts).map(f => document.fonts.load(f(40)).catch(() => null)));

    const bg = await loadImage("/ball.png", false);
    let photo: HTMLImageElement | null = null;
    let photoFailed = false;
    if (p.photoUrl) {
        try { photo = await loadImage(p.photoUrl, !p.photoUrl.startsWith("blob:")); }
        catch { photoFailed = true; }
    }

    canvas.width = W;
    canvas.height = H;
    ctx.drawImage(bg, 0, 0, W, H);

    // Darken the bottom-right (blurred banquet table) so the badge reads clearly
    const cx = 880, cy = 870, r = 165;
    const shade = ctx.createRadialGradient(cx, 1020, 40, cx, 1020, 560);
    shade.addColorStop(0, "rgba(5,4,3,0.93)");
    shade.addColorStop(0.55, "rgba(5,4,3,0.75)");
    shade.addColorStop(1, "rgba(5,4,3,0)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);

    // Gold ring with glow
    const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    ring.addColorStop(0, GOLD_GLOW);
    ring.addColorStop(0.5, GOLD);
    ring.addColorStop(1, BRONZE);
    ctx.save();
    ctx.shadowColor = "rgba(243,210,122,0.7)";
    ctx.shadowBlur = 50;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 12, 0, Math.PI * 2);
    ctx.fillStyle = ring;
    ctx.fill();
    ctx.restore();

    // Photo (cover-fit inside the circle) or initials
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (photo) {
        const scale = Math.max((r * 2) / photo.width, (r * 2) / photo.height);
        const w = photo.width * scale, h = photo.height * scale;
        ctx.drawImage(photo, cx - w / 2, cy - h / 2, w, h);
    } else {
        const fill = ctx.createRadialGradient(cx, cy - 60, 10, cx, cy, r);
        fill.addColorStop(0, "#2a1f12");
        fill.addColorStop(1, "#0A0806");
        ctx.fillStyle = fill;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        const initials = `${p.firstName[0] ?? ""}${p.lastName?.[0] ?? ""}`.toUpperCase();
        ctx.fillStyle = GOLD_LIGHT;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = fonts.big(130);
        ctx.fillText(initials || "★", cx, cy + 6);
    }
    ctx.restore();

    // Text block under the photo
    const maxW = 2 * (W - cx) - 40;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 12;

    ctx.fillStyle = GOLD_LIGHT;
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "6px";
    fitText(ctx, "I WILL BE", cx, 1100, maxW, 38, fonts.kicker);
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";

    ctx.fillStyle = "#FFFFFF";
    fitText(ctx, "ATTENDING", cx, 1172, maxW, 70, fonts.big);

    const fullName = `${p.firstName} ${p.lastName ?? ""}`.trim();
    ctx.fillStyle = GOLD_LIGHT;
    fitText(ctx, fullName, cx, 1228, maxW, 40, fonts.name);

    if (p.department) {
        ctx.fillStyle = "#E8DCC4";
        fitText(ctx, p.department.toUpperCase(), cx, 1268, maxW, 24, fonts.dept);
    }

    return !photoFailed;
}

export default function AttendFlyer(props: Props) {
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [localPhoto, setLocalPhoto] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [blob, setBlob] = useState<Blob | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);

    const photoUrl = localPhoto ?? props.photoUrl;
    const { firstName, lastName, department } = props;

    useEffect(() => {
        let cancelled = false;
        const canvas = canvasRef.current;
        if (!canvas) return;
        setBusy(true);
        drawFlyer(canvas, rootRef.current, { firstName, lastName, department, photoUrl })
            .then(photoOk => {
                if (cancelled) return;
                setNotice(photoOk ? null : "We couldn't load your photo, so your initials are shown. Tap “Change photo” to pick one.");
                canvas.toBlob(b => {
                    if (cancelled || !b) return;
                    setBlob(b);
                    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(b); });
                    setBusy(false);
                }, "image/jpeg", 0.92);
            })
            .catch(err => {
                console.error("[WAB] Flyer render failed:", err);
                if (!cancelled) { setNotice("Could not create your flyer. Please refresh and try again."); setBusy(false); }
            });
        return () => { cancelled = true; };
    }, [firstName, lastName, department, photoUrl]);

    const fileName = `workers-ball-2026-${firstName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`;

    function download() {
        if (!preview) return;
        const a = document.createElement("a");
        a.href = preview;
        a.download = fileName;
        a.click();
    }

    async function share() {
        if (!blob) return;
        const file = new File([blob], fileName, { type: "image/jpeg" });
        const url = `${window.location.origin}/workers-ball`;
        if (navigator.canShare?.({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: "Workers Ball 2026", text: `${SHARE_TEXT} ${url}` });
            } catch { /* user closed the share sheet */ }
        } else {
            download();
            setNotice("Your flyer was downloaded — post it on your WhatsApp status or Instagram!");
        }
    }

    function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) { setNotice("Please choose an image file."); return; }
        setLocalPhoto(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
    }

    function whatsappInvite() {
        const text = `${SHARE_TEXT} ${window.location.origin}/workers-ball`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    }

    const btn: React.CSSProperties = {
        flex: 1, minWidth: 0, borderRadius: 999, padding: ".8rem 1rem", fontFamily: "var(--font-oswald,Oswald,sans-serif)",
        fontWeight: 600, fontSize: 14, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", textAlign: "center",
        textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    };
    const primary: React.CSSProperties = { ...btn, background: `linear-gradient(135deg,${GOLD_LIGHT} 0%,${GOLD} 50%,${BRONZE} 100%)`, border: "none", color: "#0A0806" };
    const secondary: React.CSSProperties = { ...btn, background: "transparent", border: `1.5px solid ${GOLD}`, color: GOLD_LIGHT };

    return (
        <div ref={rootRef} style={{ width: "100%", maxWidth: 440 }}>
            <div style={{ fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontSize: 11, fontWeight: 600, color: GOLD, letterSpacing: ".14em", textTransform: "uppercase", textAlign: "center", marginBottom: 6 }}>
                Spread the word
            </div>
            <h3 style={{ fontFamily: "var(--font-archivo,'Archivo Black',sans-serif)", fontSize: 24, textTransform: "uppercase", textAlign: "center", margin: "0 0 1rem", color: "#fff" }}>
                Your &ldquo;I Will Attend&rdquo; Flyer
            </h3>

            <canvas ref={canvasRef} style={{ display: "none" }} />
            <div style={{ position: "relative", aspectRatio: "4 / 5", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(212,164,69,.55)", boxShadow: "0 20px 60px rgba(0,0,0,.6), 0 0 40px rgba(212,164,69,.15)", background: "#15100A" }}>
                {preview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt={`${firstName}'s Workers Ball 2026 "I will be attending" flyer`} style={{ width: "100%", height: "100%", display: "block", opacity: busy ? .5 : 1, transition: "opacity .3s" }} />
                )}
                {busy && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD_LIGHT, fontFamily: "var(--font-oswald,Oswald,sans-serif)", letterSpacing: ".1em", textTransform: "uppercase", fontSize: 13 }}>
                        Creating your flyer…
                    </div>
                )}
            </div>

            {notice && <p style={{ fontSize: 12, color: "#E8DCC4", textAlign: "center", margin: "12px 0 0", lineHeight: 1.5 }}>{notice}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button type="button" onClick={share} disabled={busy} style={{ ...primary, opacity: busy ? .5 : 1 }}>Share Flyer</button>
                <button type="button" onClick={download} disabled={busy} style={{ ...secondary, opacity: busy ? .5 : 1 }}>Download</button>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <label style={secondary}>
                    Change Photo
                    <input type="file" accept="image/*" onChange={pickPhoto} style={{ display: "none" }} />
                </label>
                <button type="button" onClick={whatsappInvite} style={secondary}>WhatsApp Invite</button>
            </div>
            <p style={{ fontSize: 11, color: "#A8987C", textAlign: "center", marginTop: 10 }}>
                Post it on your WhatsApp status or Instagram story and invite other workers.
            </p>
        </div>
    );
}
