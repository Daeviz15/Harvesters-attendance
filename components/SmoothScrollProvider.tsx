"use client";

import { useEffect } from 'react';
import Lenis from 'lenis';

export default function SmoothScrollProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    useEffect(() => {
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            orientation: 'vertical',
            smoothWheel: true,
            wheelMultiplier: 1,
            touchMultiplier: 1.5,
            autoResize: true,
            prevent: (node) => {
                if (!node || typeof (node as HTMLElement).closest !== 'function') return false;
                return (
                    !!(node as HTMLElement).closest('[data-lenis-prevent]') ||
                    !!(node as HTMLElement).closest('.overflow-y-auto') ||
                    !!(node as HTMLElement).closest('.overflow-auto')
                );
            },
        });

        let rafId: number;
        function raf(time: number) {
            lenis.raf(time);
            rafId = requestAnimationFrame(raf);
        }

        rafId = requestAnimationFrame(raf);

        return () => {
            cancelAnimationFrame(rafId);
            lenis.destroy();
        };
    }, []);

    return <>{children}</>;
}

