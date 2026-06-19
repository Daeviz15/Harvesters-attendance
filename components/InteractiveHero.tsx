"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronRight, MapPin, Clock, Shield } from "lucide-react";
import { motion, useScroll } from "framer-motion";

export default function InteractiveHero() {
    const [isCheckedIn, setIsCheckedIn] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    // High-performance scroll tracking via Framer Motion (doesn't trigger React renders on every pixel)
    const { scrollY } = useScroll();
    const [isLeaving, setIsLeaving] = useState(false);
    const [isOutside, setIsOutside] = useState(false);

    // Mock timer logic
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isCheckedIn && !isOutside) {
            interval = setInterval(() => {
                setElapsedSeconds((prev) => prev + 1);
            }, 1000);
        } else if (!isCheckedIn) {
            setElapsedSeconds(0);
        }
        return () => clearInterval(interval);
    }, [isCheckedIn, isOutside]);

    useEffect(() => {
        return scrollY.on("change", (latest) => {
            // Only trigger state updates (re-renders) when crossing thresholds
            setIsLeaving(latest > 330);
            setIsOutside(latest > 530);
        });
    }, [scrollY]);

    const formatTime = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    };

    return (
        <section className="relative z-10 max-w-6xl mx-auto px-6 pt-16 md:pt-24 lg:pt-32 pb-16 md:pb-24 flex flex-col items-center">

            {/* Desktop/Tablet Split Layout */}
            <div className="w-full flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12 relative">

                {/* SVG Animated Connector Line (Desktop Only) */}
                <div className="absolute inset-0 pointer-events-none hidden lg:block z-30">
                    <svg className="w-full h-full" style={{ overflow: "visible" }}>
                        {/* 
                            Draws from the right edge of the "Start Tracking" button 
                            and curves elegantly into the Check In circle.
                        */}
                        <motion.path
                            d="M 230 400 Q 320 520 405 450"
                            stroke="#ffffff"
                            strokeWidth="2.5"
                            strokeDasharray="4 8"
                            strokeLinecap="round"
                            fill="none"
                            initial={{ pathLength: 0, opacity: 0 }}
                            whileInView={{ pathLength: 1, opacity: 0.5 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 1.5, ease: "easeInOut", delay: 0.5 }}
                        />
                    </svg>
                </div>

                {/* Left Text (Hidden on mobile, shown on lg) */}
                <div className="hidden lg:flex flex-1 flex-col items-start text-left relative z-40 lg:translate-x-8 xl:translate-x-12">
                    <h1 className="text-5xl xl:text-[4.5rem] leading-[1.05] font-bold tracking-tight text-neutral-900 dark:text-white mb-8">
                        Smart <br />
                        <span className="text-[#34A853]">Tracking</span>
                    </h1>
                    <Link
                        href="/auth/signup"
                        className="group flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-[#34A853] hover:bg-[#2e9347] text-white font-semibold tracking-wider text-sm uppercase transition-all shadow-xl shadow-[#34A853]/25 hover:shadow-2xl hover:shadow-[#34A853]/30"
                    >
                        Start Tracking
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                </div>

                {/* Mobile Header (Hidden on lg) */}
                <div className="lg:hidden text-center w-full max-w-md mx-auto mb-8">
                    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-neutral-900 dark:text-white leading-[1.1]">
                        Smart <span className="text-[#34A853]">Tracking</span> <br />
                        Attendance for Workers
                    </h1>
                </div>

                {/* Center: Phone Mockup */}
                <div className="relative shrink-0 z-20 lg:-translate-x-4 xl:-translate-x-8">
                    {/* Phone Frame */}
                    <div className="relative w-[280px] sm:w-[320px] h-[580px] sm:h-[650px] bg-[#0a0a0a] rounded-[2.5rem] border-[8px] border-neutral-800 dark:border-neutral-800 shadow-2xl shadow-[#34A853]/20 overflow-hidden flex flex-col">

                        {/* Phone Notch/Dynamic Island */}
                        <div className="absolute top-0 inset-x-0 h-6 flex justify-center z-50">
                            <div className="w-32 h-6 bg-neutral-800 rounded-b-3xl"></div>
                        </div>

                        {/* Mockup UI Content (Based on Dashboard) */}
                        <div className="flex-1 w-full bg-[#0a0a0a] text-white flex flex-col relative pt-10 px-5 pb-6 overflow-hidden">

                            {/* Top Nav */}
                            <div className="flex items-center justify-between mb-8">
                                <div className="space-y-1.5">
                                    <div className="w-5 h-0.5 bg-white/70 rounded-full"></div>
                                    <div className="w-5 h-0.5 bg-white/70 rounded-full"></div>
                                    <div className="w-5 h-0.5 bg-white/70 rounded-full"></div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-white/10 border border-white/5">
                                        <div className="w-3.5 h-3.5 rounded-full bg-white/20"></div>
                                        <div className="w-3.5 h-3.5 rounded-full bg-white/20"></div>
                                        <div className="w-3.5 h-3.5 rounded-full bg-white/80"></div>
                                    </div>
                                    <div className="w-7 h-7 rounded-full overflow-hidden border border-[#34A853]/30 bg-neutral-200">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src="https://i.pravatar.cc/150?img=44" alt="Blessing" className="w-full h-full object-cover" />
                                    </div>
                                </div>
                            </div>

                            {/* Greeting */}
                            <div className="mb-6">
                                <h2 className="text-3xl font-bold tracking-tight text-white mb-2 leading-tight">Good Afternoon,<br />Blessing.</h2>
                                <p className="text-[13px] text-white/50 leading-relaxed">Ready to serve today? Mark your attendance below.</p>
                            </div>

                            {/* Location Pill */}
                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors duration-500 mb-12 self-start ${isOutside ? 'bg-red-500/10 border-red-500/20 text-red-500'
                                : isLeaving ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                                    : 'bg-[#34A853]/10 border-[#34A853]/20 text-[#34A853]'
                                }`}>
                                <MapPin className="w-3 h-3" />
                                {isOutside ? (
                                    <span className="text-[10px] font-medium tracking-wide">
                                        Location Lost
                                    </span>
                                ) : isLeaving ? (
                                    <span className="text-[10px] font-medium tracking-wide flex items-center">
                                        Leaving
                                        <span className="inline-flex ml-0.5">
                                            <motion.span animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0 }}>.</motion.span>
                                            <motion.span animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }}>.</motion.span>
                                            <motion.span animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }}>.</motion.span>
                                        </span>
                                    </span>
                                ) : (
                                    <span className="text-[10px] font-medium tracking-wide">
                                        Detected at The Globe Church, Ologolo
                                    </span>
                                )}
                            </div>

                            {/* Check In / Active State Area */}
                            <div className="flex-1 flex justify-center items-start pt-4 relative">
                                {isOutside ? (
                                    /* Outside Perimeter State */
                                    <motion.div
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="relative w-48 h-48 rounded-full flex flex-col items-center justify-center gap-2 shadow-2xl bg-neutral-800 border-4 border-neutral-900 opacity-80 cursor-not-allowed"
                                    >
                                        <Shield className="w-5 h-5 text-red-400 mb-1" />
                                        <span className="text-[20px] font-bold tracking-tight text-white/50 text-center leading-tight">
                                            Outside<br />Perimeter
                                        </span>
                                        <span className="text-[9px] text-red-400/80 tracking-widest uppercase mt-2">
                                            Check-in Disabled
                                        </span>
                                    </motion.div>
                                ) : isCheckedIn ? (
                                    /* Active Session State */
                                    <motion.div
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="relative w-48 h-48 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-500 shadow-2xl bg-[#34A853]/10 border-2 border-[#34A853]/30 cursor-pointer"
                                        onClick={() => setIsCheckedIn(false)}
                                        title="Click to reset mockup"
                                    >
                                        <div className="w-2.5 h-2.5 rounded-full bg-[#34A853] animate-pulse mb-1"></div>
                                        <span className="text-[24px] font-bold tracking-tight text-[#34A853]">
                                            Active
                                        </span>
                                        <div className="flex items-center gap-1.5 text-white/60 mt-0.5">
                                            <Clock className="w-3.5 h-3.5" />
                                            <span className="text-sm font-mono tracking-wider">{formatTime(elapsedSeconds)}</span>
                                        </div>
                                        <span className="text-[9px] text-white/35 tracking-wider uppercase mt-2 text-center px-4">
                                            Auto-checkout on exit
                                        </span>
                                    </motion.div>
                                ) : (
                                    /* Check In Button */
                                    <>
                                        {/* Ripple Effect */}
                                        <div className="absolute top-[85px] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[220px] h-[220px] bg-[#34A853]/20 rounded-full animate-ping opacity-75" style={{ animationDuration: '2.5s' }}></div>

                                        <button
                                            onClick={() => setIsCheckedIn(true)}
                                            className="relative w-48 h-48 rounded-full bg-[#34A853] hover:bg-[#2e9347] transition-colors flex flex-col items-center justify-center shadow-lg shadow-[#34A853]/20 z-10 border-4 border-[#0a0a0a] cursor-pointer"
                                        >
                                            <span className="text-[28px] font-bold tracking-tight mb-1 text-white">Check In</span>
                                            <span className="text-[11px] font-medium text-white/80 tracking-widest uppercase mt-1">Tap to record</span>
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Bottom Line */}
                            <div className="w-32 h-1 bg-white/20 rounded-full mx-auto mt-auto"></div>
                        </div>

                    </div>
                </div>

                {/* Right Text (Hidden on mobile, shown on lg) */}
                <div className="hidden lg:flex flex-1 flex-col items-end lg:-translate-x-8 xl:-translate-x-16">
                    <div className="text-left">
                        <h1 className="text-5xl xl:text-[4.5rem] leading-[1.05] font-bold tracking-tight text-neutral-900 dark:text-white mb-6">
                            Attendance <br />
                            <span className="text-3xl xl:text-[2.5rem] font-medium text-neutral-400 dark:text-white/40 leading-none">for </span>
                            Workers
                        </h1>
                        <p className="text-lg text-neutral-500 dark:text-white/50 max-w-xs leading-relaxed">
                            A modern, location-verified system. Check in with confidence, stay accountable.
                        </p>
                    </div>
                </div>

            </div>

            {/* Mobile Subtext (Hidden on lg) */}
            <div className="lg:hidden text-center max-w-md mx-auto mt-8 mb-2">
                <p className="text-base text-neutral-500 dark:text-white/50 leading-relaxed">
                    A modern, location-verified system designed exclusively for workers. Check in with confidence.
                </p>
            </div>

            {/* Mobile CTA Button (Below Phone, hidden on lg) */}
            <div className="mt-10 lg:hidden flex flex-col w-full sm:w-auto items-center justify-center z-20">
                <Link
                    href="/auth/signup"
                    className="group flex w-full sm:w-auto items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-[#34A853] hover:bg-[#2e9347] text-white font-semibold tracking-wider text-sm uppercase transition-all shadow-xl shadow-[#34A853]/25 hover:shadow-2xl hover:shadow-[#34A853]/30"
                >
                    Start Tracking
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
            </div>
        </section>
    );
}
