"use client";

import { useEffect, useRef } from "react";

// Gold-and-black gala palette from ball.json
const COLORS = ["#FFE7A3", "#F3D27A", "#D4A445", "#A97A2B", "#F7D046", "#FFFFFF"];

type Piece = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; round: boolean; tilt: number };

/** One-off celebratory confetti burst that fades out after ~6 seconds. */
export default function Confetti() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const resize = () => {
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener("resize", resize);
        const w = () => window.innerWidth;
        const h = () => window.innerHeight;

        const pieces: Piece[] = [];
        const make = (x: number, y: number, vx: number, vy: number): Piece => ({
            x, y, vx, vy,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.3,
            size: 6 + Math.random() * 7,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            round: Math.random() > 0.6,
            tilt: Math.random() * Math.PI,
        });

        // Two cannons from the bottom corners…
        for (const [originX, angle] of [[0, -Math.PI / 3], [w(), (-2 * Math.PI) / 3]] as const) {
            for (let i = 0; i < 110; i++) {
                const a = angle + (Math.random() - 0.5) * 0.9;
                const speed = 9 + Math.random() * 11;
                pieces.push(make(originX, h() * 0.85, Math.cos(a) * speed, Math.sin(a) * speed));
            }
        }
        // …then a gentle rain from the top
        const rain = window.setTimeout(() => {
            for (let i = 0; i < 100; i++) {
                pieces.push(make(Math.random() * w(), -20 - Math.random() * 200, (Math.random() - 0.5) * 2, 2 + Math.random() * 3));
            }
        }, 450);

        let raf = 0;
        const start = performance.now();
        const tick = (now: number) => {
            ctx.clearRect(0, 0, w(), h());
            const fade = Math.max(0, 1 - Math.max(0, now - start - 4500) / 1500);
            for (const p of pieces) {
                p.vy += 0.28;
                p.vx *= 0.985;
                p.vy *= 0.985;
                p.x += p.vx;
                p.y += p.vy;
                p.rot += p.vr;
                p.tilt += 0.1;
                ctx.save();
                ctx.globalAlpha = fade;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.scale(1, Math.cos(p.tilt));
                ctx.fillStyle = p.color;
                if (p.round) {
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size / 2.5, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
                }
                ctx.restore();
            }
            if (fade > 0) raf = requestAnimationFrame(tick);
            else ctx.clearRect(0, 0, w(), h());
        };
        raf = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(raf);
            window.clearTimeout(rain);
            window.removeEventListener("resize", resize);
        };
    }, []);

    return <canvas ref={canvasRef} aria-hidden="true" style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 50 }} />;
}
