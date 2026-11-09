"use client";

import { useEffect, useRef, useState } from "react";

// Builds a personal "I will be attending the Ball" image on top of the official flyer
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

// Photo circle on the flyer
const CX = 880, CY = 860, R = 165;

/** Photo position in the circle. x/y are offsets in circle diameters; zoom 1 = just fills the circle. */
type Crop = { zoom: number; x: number; y: number };
const DEFAULT_CROP: Crop = { zoom: 1, x: 0, y: 0 };
const MAX_ZOOM = 3;

function cropBounds(photo: HTMLImageElement, zoom: number) {
    const scale = zoom / Math.min(photo.naturalWidth, photo.naturalHeight);
    const w = photo.naturalWidth * scale;
    const h = photo.naturalHeight * scale;
    return { w, h, maxX: (w - 1) / 2, maxY: (h - 1) / 2 };
}

/** Keeps the photo covering the whole circle, whatever the zoom/drag. */
function clampCrop(photo: HTMLImageElement, c: Crop): Crop {
    const zoom = Math.min(MAX_ZOOM, Math.max(1, c.zoom));
    const { maxX, maxY } = cropBounds(photo, zoom);
    return { zoom, x: Math.min(maxX, Math.max(-maxX, c.x)), y: Math.min(maxY, Math.max(-maxY, c.y)) };
}

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

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

async function drawFlyer(
    canvas: HTMLCanvasElement,
    fontEl: HTMLElement | null,
    p: { firstName: string; lastName?: string; department?: string; photo: HTMLImageElement | null; crop: Crop },
) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

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

    canvas.width = W;
    canvas.height = H;
    ctx.drawImage(bg, 0, 0, W, H);

    // Darken the bottom-right (blurred banquet table) so the badge reads clearly
    const shade = ctx.createRadialGradient(CX, 1020, 40, CX, 1020, 560);
    shade.addColorStop(0, "rgba(5,4,3,0.93)");
    shade.addColorStop(0.55, "rgba(5,4,3,0.75)");
    shade.addColorStop(1, "rgba(5,4,3,0)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);

    // Gold ring with glow
    const ring = ctx.createLinearGradient(CX - R, CY - R, CX + R, CY + R);
    ring.addColorStop(0, GOLD_GLOW);
    ring.addColorStop(0.5, GOLD);
    ring.addColorStop(1, BRONZE);
    ctx.save();
    ctx.shadowColor = "rgba(243,210,122,0.7)";
    ctx.shadowBlur = 50;
    ctx.beginPath();
    ctx.arc(CX, CY, R + 12, 0, Math.PI * 2);
    ctx.fillStyle = ring;
    ctx.fill();
    ctx.restore();

    // Photo (positioned by the attendee) or initials
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#0A0806";
    ctx.fillRect(CX - R, CY - R, R * 2, R * 2);
    if (p.photo) {
        const D = R * 2;
        const c = clampCrop(p.photo, p.crop);
        const { w, h } = cropBounds(p.photo, c.zoom);
        ctx.drawImage(p.photo, CX + (c.x - w / 2) * D, CY + (c.y - h / 2) * D, w * D, h * D);
    } else {
        const fill = ctx.createRadialGradient(CX, CY - 60, 10, CX, CY, R);
        fill.addColorStop(0, "#2a1f12");
        fill.addColorStop(1, "#0A0806");
        ctx.fillStyle = fill;
        ctx.fillRect(CX - R, CY - R, R * 2, R * 2);
        const initials = `${p.firstName[0] ?? ""}${p.lastName?.[0] ?? ""}`.toUpperCase();
        ctx.fillStyle = GOLD_LIGHT;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = fonts.big(130);
        ctx.fillText(initials || "★", CX, CY + 6);
    }
    ctx.restore();

    // Text block under the photo: I WILL BE ATTENDING / THE BALL / name / department
    const maxW = 2 * (W - CX) - 40;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 12;

    ctx.fillStyle = GOLD_LIGHT;
    setSpacing(ctx, 4);
    fitText(ctx, "I WILL BE ATTENDING", CX, 1088, maxW, 30, fonts.kicker);
    setSpacing(ctx, 0);

    ctx.fillStyle = "#FFFFFF";
    fitText(ctx, "THE BALL", CX, 1160, maxW, 74, fonts.big);

    const fullName = `${p.firstName} ${p.lastName ?? ""}`.trim();
    ctx.fillStyle = GOLD_LIGHT;
    fitText(ctx, fullName, CX, 1218, maxW, 40, fonts.name);

    if (p.department) {
        ctx.fillStyle = "#E8DCC4";
        fitText(ctx, p.department.toUpperCase(), CX, 1260, maxW, 24, fonts.dept);
    }
}

// ─── Photo adjuster ───────────────────────────────────────────────────────────

const EDITOR = 240; // px size of the circle in the adjuster

function PhotoAdjuster({ photo, initialCrop, onCancel, onSave, onChangePhoto }: {
    photo: HTMLImageElement;
    initialCrop: Crop;
    onCancel: () => void;
    onSave: (c: Crop) => void;
    onChangePhoto: () => void;
}) {
    const [crop, setCrop] = useState(initialCrop);
    const drag = useRef<{ id: number; sx: number; sy: number; start: Crop } | null>(null);
    const b = cropBounds(photo, crop.zoom);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onCancel]);

    const pill: React.CSSProperties = {
        borderRadius: 999, padding: ".7rem 1rem", fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontWeight: 600,
        fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", flex: 1,
    };

    return (
        <div role="dialog" aria-modal="true" aria-label="Adjust your photo"
            style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(5,4,3,.88)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
            <div style={{ width: "100%", maxWidth: 380, background: "#15100A", border: "1px solid rgba(212,164,69,.55)", borderRadius: 16, padding: "1.5rem", textAlign: "center", color: "#fff" }}>
                <h3 style={{ fontFamily: "var(--font-archivo,'Archivo Black',sans-serif)", fontSize: 20, textTransform: "uppercase", margin: "0 0 .35rem" }}>Adjust your photo</h3>
                <p style={{ fontSize: 13, color: "#A8987C", margin: "0 0 1.25rem" }}>Drag to move your photo. Use the slider to zoom.</p>

                <div
                    onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, start: crop }; }}
                    onPointerMove={e => {
                        const d = drag.current;
                        if (!d || d.id !== e.pointerId) return;
                        setCrop(clampCrop(photo, { ...d.start, x: d.start.x + (e.clientX - d.sx) / EDITOR, y: d.start.y + (e.clientY - d.sy) / EDITOR }));
                    }}
                    onPointerUp={() => { drag.current = null; }}
                    onPointerCancel={() => { drag.current = null; }}
                    style={{ position: "relative", width: EDITOR, height: EDITOR, margin: "0 auto", borderRadius: "50%", overflow: "hidden", background: "#0A0806", border: `4px solid ${GOLD}`, boxShadow: "0 0 30px rgba(243,210,122,.35)", touchAction: "none", cursor: "grab", userSelect: "none" }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element -- positioned crop preview */}
                    <img src={photo.src} alt="" draggable={false} style={{
                        position: "absolute", maxWidth: "none", pointerEvents: "none",
                        width: b.w * EDITOR, height: b.h * EDITOR,
                        left: (0.5 + crop.x - b.w / 2) * EDITOR, top: (0.5 + crop.y - b.h / 2) * EDITOR,
                    }} />
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 10, margin: "1.25rem auto 0", maxWidth: 280, fontSize: 12, color: "#A8987C" }}>
                    <span aria-hidden>−</span>
                    <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={crop.zoom} aria-label="Zoom"
                        onChange={e => setCrop(clampCrop(photo, { ...crop, zoom: Number(e.target.value) }))}
                        style={{ flex: 1, accentColor: GOLD }} />
                    <span aria-hidden>+</span>
                </label>

                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: "1rem", flexWrap: "wrap" }}>
                    <button type="button" onClick={onChangePhoto} style={{ ...pill, flex: "0 1 auto", background: "transparent", border: `1.5px solid ${GOLD}`, color: GOLD_LIGHT, fontSize: 12, padding: ".55rem .9rem" }}>Use another photo</button>
                    <button type="button" onClick={() => setCrop(DEFAULT_CROP)} style={{ ...pill, flex: "0 1 auto", background: "transparent", border: `1.5px solid ${GOLD}`, color: GOLD_LIGHT, fontSize: 12, padding: ".55rem .9rem" }}>Re-centre</button>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: "1.25rem" }}>
                    <button type="button" onClick={onCancel} style={{ ...pill, background: "transparent", border: "1px solid rgba(255,255,255,.2)", color: "#E8DCC4" }}>Cancel</button>
                    <button type="button" onClick={() => onSave(crop)} style={{ ...pill, background: `linear-gradient(135deg,${GOLD_LIGHT} 0%,${GOLD} 50%,${BRONZE} 100%)`, border: "none", color: "#0A0806" }}>Save</button>
                </div>
            </div>
        </div>
    );
}

// ─── Brand icons ──────────────────────────────────────────────────────────────

function WhatsAppIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.45-9.44a9.38 9.38 0 0 1 9.43 9.45c0 5.2-4.24 9.44-9.45 9.44m8.04-17.48A11.3 11.3 0 0 0 12.05.7C5.78.7.68 5.8.68 12.07c0 2 .52 3.96 1.52 5.68L.58 23.7l6.08-1.6a11.33 11.33 0 0 0 5.39 1.37h.01c6.27 0 11.37-5.1 11.37-11.37 0-3.04-1.18-5.9-3.33-8.05" />
        </svg>
    );
}

function InstagramIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
        </svg>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AttendFlyer(props: Props) {
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const [localPhoto, setLocalPhoto] = useState<string | null>(null);
    const photoUrl = localPhoto ?? props.photoUrl;
    // Loaded photo, tagged with the URL it came from so a stale one is never used
    const [loaded, setLoaded] = useState<{ url: string | null; img: HTMLImageElement | null; failed: boolean } | null>(null);
    const [crop, setCrop] = useState<Crop>(DEFAULT_CROP);
    const [adjusting, setAdjusting] = useState(false);
    const [render, setRender] = useState<{ preview: string; blob: Blob } | null>(null);
    const [renderError, setRenderError] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    const { firstName, lastName, department } = props;
    const photoState = loaded && loaded.url === photoUrl ? loaded : null;
    const busy = !photoState || !render;

    // 1. Load the photo whenever it changes
    useEffect(() => {
        let cancelled = false;
        const done = (img: HTMLImageElement | null, failed: boolean) => {
            if (cancelled) return;
            setLoaded({ url: photoUrl, img, failed });
            setCrop(DEFAULT_CROP);
        };
        if (!photoUrl) { Promise.resolve().then(() => done(null, false)); }
        else loadImage(photoUrl, !photoUrl.startsWith("blob:")).then(img => done(img, false), () => done(null, true));
        return () => { cancelled = true; };
    }, [photoUrl]);

    // 2. Redraw the flyer whenever the photo, its position or the details change
    const photoImg = photoState?.img ?? null;
    const photoReady = !!photoState;
    useEffect(() => {
        if (!photoReady) return;
        let cancelled = false;
        const canvas = canvasRef.current;
        if (!canvas) return;
        drawFlyer(canvas, rootRef.current, { firstName, lastName, department, photo: photoImg, crop })
            .then(() => {
                canvas.toBlob(b => {
                    if (cancelled || !b) return;
                    setRenderError(false);
                    setRender(prev => {
                        if (prev) URL.revokeObjectURL(prev.preview);
                        return { preview: URL.createObjectURL(b), blob: b };
                    });
                }, "image/jpeg", 0.92);
            })
            .catch(err => {
                console.error("[WAB] Flyer render failed:", err);
                if (!cancelled) setRenderError(true);
            });
        return () => { cancelled = true; };
    }, [photoReady, photoImg, crop, firstName, lastName, department]);

    const photoNotice = photoState?.failed ? "We couldn't load your photo, so your initials are shown. Tap “Add photo” to pick one." : null;
    const shownNotice = renderError ? "Could not create your flyer. Please refresh and try again." : (notice ?? photoNotice);

    const fileName = `workers-ball-2026-${firstName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`;
    const inviteText = () => `${SHARE_TEXT} ${window.location.origin}/workers-ball`;

    function download() {
        if (!render) return;
        const a = document.createElement("a");
        a.href = render.preview;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    /** Opens the phone's share sheet with the flyer attached. Returns false if the device can't share files. */
    async function shareFile(): Promise<boolean> {
        if (!render) return false;
        const file = new File([render.blob], fileName, { type: "image/jpeg" });
        if (!navigator.canShare?.({ files: [file] })) return false;
        try {
            await navigator.share({ files: [file], title: "Workers Ball 2026", text: inviteText() });
        } catch { /* user closed the share sheet */ }
        return true;
    }

    async function shareWhatsApp() {
        setNotice(null);
        if (await shareFile()) return;
        download();
        window.open(`https://wa.me/?text=${encodeURIComponent(inviteText())}`, "_blank", "noopener,noreferrer");
        setNotice("Your flyer was downloaded — attach it in the WhatsApp chat or status that just opened.");
    }

    async function shareInstagram() {
        setNotice(null);
        if (await shareFile()) return;
        download();
        setNotice("Your flyer was downloaded — open Instagram and add it to your story or a post.");
    }

    async function shareOther() {
        setNotice(null);
        if (await shareFile()) return;
        download();
        setNotice("Your flyer was downloaded — post it on any of your social pages.");
    }

    function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        if (!f.type.startsWith("image/")) { setNotice("Please choose an image file."); return; }
        setNotice(null);
        setAdjusting(true); // the adjuster opens as soon as the new photo has loaded
        setLocalPhoto(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
    }

    const btn: React.CSSProperties = {
        flex: 1, minWidth: 0, borderRadius: 999, padding: ".8rem 1rem", fontFamily: "var(--font-oswald,Oswald,sans-serif)",
        fontWeight: 600, fontSize: 14, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", textAlign: "center",
        textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    };
    const primary: React.CSSProperties = { ...btn, background: `linear-gradient(135deg,${GOLD_LIGHT} 0%,${GOLD} 50%,${BRONZE} 100%)`, border: "none", color: "#0A0806" };
    const secondary: React.CSSProperties = { ...btn, background: "transparent", border: `1.5px solid ${GOLD}`, color: GOLD_LIGHT };
    const dim = (s: React.CSSProperties): React.CSSProperties => ({ ...s, opacity: busy ? .5 : 1 });

    return (
        <div ref={rootRef} style={{ width: "100%", maxWidth: 440 }}>
            <div style={{ fontFamily: "var(--font-oswald,Oswald,sans-serif)", fontSize: 11, fontWeight: 600, color: GOLD, letterSpacing: ".14em", textTransform: "uppercase", textAlign: "center", marginBottom: 6 }}>
                Spread the word
            </div>
            <h3 style={{ fontFamily: "var(--font-archivo,'Archivo Black',sans-serif)", fontSize: 24, textTransform: "uppercase", textAlign: "center", margin: "0 0 .5rem", color: "#fff" }}>
                Your &ldquo;I Will Be Attending&rdquo; Flyer
            </h3>
            <p style={{ fontSize: 13, color: "#E8DCC4", textAlign: "center", margin: "0 0 1rem", lineHeight: 1.55 }}>
                Download it and share it on WhatsApp, Instagram and your other social pages so more workers can join us.
            </p>

            <canvas ref={canvasRef} style={{ display: "none" }} />
            <div style={{ position: "relative", aspectRatio: "4 / 5", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(212,164,69,.55)", boxShadow: "0 20px 60px rgba(0,0,0,.6), 0 0 40px rgba(212,164,69,.15)", background: "#15100A" }}>
                {render && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={render.preview} alt={`${firstName}'s Workers Ball 2026 "I will be attending" flyer`} style={{ width: "100%", height: "100%", display: "block", opacity: busy ? .5 : 1, transition: "opacity .3s" }} />
                )}
                {busy && !renderError && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD_LIGHT, fontFamily: "var(--font-oswald,Oswald,sans-serif)", letterSpacing: ".1em", textTransform: "uppercase", fontSize: 13 }}>
                        Creating your flyer…
                    </div>
                )}
            </div>

            {/* Fix a badly placed photo */}
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
                {photoImg && (
                    <button type="button" onClick={() => setAdjusting(true)} disabled={busy}
                        style={{ background: "none", border: "none", color: GOLD_LIGHT, fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", padding: 4 }}>
                        Photo not well placed? Adjust it
                    </button>
                )}
                <button type="button" onClick={() => fileRef.current?.click()}
                    style={{ background: "none", border: "none", color: GOLD_LIGHT, fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", padding: 4 }}>
                    {photoImg ? "Change photo" : "Add photo"}
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={{ display: "none" }} />
            </div>

            {shownNotice && <p role="status" style={{ fontSize: 12, color: "#E8DCC4", textAlign: "center", margin: "10px 0 0", lineHeight: 1.5 }}>{shownNotice}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button type="button" onClick={download} disabled={busy} style={dim(primary)}>Download Flyer</button>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button type="button" onClick={shareWhatsApp} disabled={busy} style={dim({ ...btn, background: "#25D366", border: "none", color: "#fff" })}>
                    <WhatsAppIcon /> WhatsApp
                </button>
                <button type="button" onClick={shareInstagram} disabled={busy} style={dim({ ...btn, background: "linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)", border: "none", color: "#fff" })}>
                    <InstagramIcon /> Instagram
                </button>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button type="button" onClick={shareOther} disabled={busy} style={dim(secondary)}>More apps</button>
            </div>
            <p style={{ fontSize: 11, color: "#A8987C", textAlign: "center", marginTop: 10 }}>
                Post it on your WhatsApp status or Instagram story and invite other workers.
            </p>

            {adjusting && photoImg && (
                <PhotoAdjuster
                    key={photoImg.src}
                    photo={photoImg}
                    initialCrop={crop}
                    onCancel={() => setAdjusting(false)}
                    onSave={c => { setCrop(c); setAdjusting(false); }}
                    onChangePhoto={() => fileRef.current?.click()}
                />
            )}
        </div>
    );
}
