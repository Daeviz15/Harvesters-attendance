"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import { UserPlus, MapPin, Activity } from "lucide-react";

export default function AnimatedTimeline() {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start center", "end center"]
    });

    // Smooth out the scroll progress for the tracing beam
    const beamProgress = useSpring(scrollYProgress, {
        stiffness: 400,
        damping: 40,
        restDelta: 0.001
    });

    const cinematicReveal = {
        initial: { opacity: 0, y: 40, filter: "blur(10px)" },
        whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
        viewport: { once: true, margin: "-100px" },
        transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] }
    };

    return (
        <section ref={containerRef} className="relative z-10 w-full bg-neutral-50 dark:bg-background py-24 border-y border-neutral-200 dark:border-white/5 mt-20 overflow-hidden">
            <div className="max-w-6xl mx-auto px-6">
                <motion.h2 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6 }}
                    className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900 dark:text-white mb-20 text-center uppercase tracking-widest"
                >
                    How It Works
                </motion.h2>

                <div className="relative max-w-5xl mx-auto">
                    {/* Background Track (Dotted Spine) */}
                    <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-[3px] border-l-[4px] border-dotted border-neutral-300 dark:border-neutral-800 -translate-x-1/2" />

                    {/* Aceternity Tracing Beam */}
                    <motion.div 
                        style={{ scaleY: beamProgress }}
                        className="hidden md:block absolute left-1/2 top-0 bottom-0 w-[4px] -translate-x-1/2 origin-top bg-gradient-to-b from-transparent via-[#34A853] to-[#34A853] rounded-full z-0 shadow-[0_0_30px_rgba(52,168,83,1)]" 
                    />

                    {/* STEP 01 */}
                    <div className="relative flex flex-col md:flex-row items-center justify-between mb-24 md:mb-32">
                        {/* Central Step Marker */}
                        <motion.div 
                            {...cinematicReveal}
                            className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center bg-neutral-50 dark:bg-background py-6 px-4 z-10"
                        >
                            <span className="text-[12px] font-bold tracking-[0.25em] text-neutral-400 uppercase mb-2">Step</span>
                            <span className="text-6xl font-black text-neutral-800 dark:text-white leading-none">01</span>
                        </motion.div>

                        {/* Mobile Step Marker */}
                        <div className="md:hidden flex flex-col items-center justify-center mb-8">
                            <span className="text-[12px] font-bold tracking-[0.25em] text-neutral-400 uppercase mb-1">Step</span>
                            <span className="text-6xl font-black text-neutral-800 dark:text-white leading-none">01</span>
                        </div>

                        {/* Text (Left) */}
                        <motion.div 
                            {...cinematicReveal}
                            transition={{ ...cinematicReveal.transition, delay: 0.1 }}
                            className="w-full md:w-[45%] flex flex-col text-center md:text-right md:items-end items-center mb-12 md:mb-0 pr-0 md:pr-12"
                        >
                            <h3 className="text-2xl md:text-3xl font-bold text-[#34A853] mb-4">Sign Up Online</h3>
                            <p className="text-sm md:text-base text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-sm">
                                Create your account quickly with email or Google Sign-In. Complete your profile by selecting your department and adding a photo so your team recognizes you.
                            </p>
                            <div className="mt-8 flex gap-2.5 opacity-30 justify-center md:justify-end w-full">
                                {[...Array(10)].map((_, i) => (
                                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                                ))}
                            </div>
                        </motion.div>

                        {/* Image (Right) */}
                        <motion.div 
                            {...cinematicReveal}
                            transition={{ ...cinematicReveal.transition, delay: 0.2 }}
                            className="w-full md:w-[45%] flex justify-center md:justify-start pl-0 md:pl-12"
                        >
                            <div className="w-64 h-64 md:w-80 md:h-80 rounded-full bg-[#34A853] flex items-center justify-center shadow-2xl shadow-[#34A853]/20 relative">
                                <div className="absolute inset-4 rounded-full border-2 border-white/20" />
                                <UserPlus className="w-24 h-24 md:w-32 md:h-32 text-white" strokeWidth={1.5} />
                            </div>
                        </motion.div>
                    </div>

                    {/* STEP 02 */}
                    <div className="relative flex flex-col md:flex-row-reverse items-center justify-between mb-24 md:mb-32">
                        {/* Central Step Marker */}
                        <motion.div 
                            {...cinematicReveal}
                            className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center bg-neutral-50 dark:bg-background py-6 px-4 z-10"
                        >
                            <span className="text-[12px] font-bold tracking-[0.25em] text-neutral-400 uppercase mb-2">Step</span>
                            <span className="text-6xl font-black text-neutral-800 dark:text-white leading-none">02</span>
                        </motion.div>

                        {/* Mobile Step Marker */}
                        <div className="md:hidden flex flex-col items-center justify-center mb-8">
                            <span className="text-[12px] font-bold tracking-[0.25em] text-neutral-400 uppercase mb-1">Step</span>
                            <span className="text-6xl font-black text-neutral-800 dark:text-white leading-none">02</span>
                        </div>

                        {/* Text (Right) */}
                        <motion.div 
                            {...cinematicReveal}
                            transition={{ ...cinematicReveal.transition, delay: 0.1 }}
                            className="w-full md:w-[45%] flex flex-col text-center md:text-left md:items-start items-center mb-12 md:mb-0 pl-0 md:pl-12"
                        >
                            <h3 className="text-2xl md:text-3xl font-bold text-[#34A853] mb-4">Location Verified Check-In</h3>
                            <p className="text-sm md:text-base text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-sm">
                                When you arrive at church, simply open the app. Our GPS-powered geofencing will instantly verify your presence at the premises. Tap "Check In" to record your attendance seamlessly.
                            </p>
                            <div className="mt-8 flex gap-2.5 opacity-30 justify-center md:justify-start w-full">
                                {[...Array(10)].map((_, i) => (
                                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                                ))}
                            </div>
                        </motion.div>

                        {/* Image (Left) */}
                        <motion.div 
                            {...cinematicReveal}
                            transition={{ ...cinematicReveal.transition, delay: 0.2 }}
                            className="w-full md:w-[45%] flex justify-center md:justify-end pr-0 md:pr-12"
                        >
                            <div className="w-64 h-64 md:w-80 md:h-80 rounded-full bg-[#34A853] flex items-center justify-center shadow-2xl shadow-[#34A853]/20 relative">
                                <div className="absolute inset-4 rounded-full border-2 border-white/20" />
                                <MapPin className="w-24 h-24 md:w-32 md:h-32 text-white" strokeWidth={1.5} />
                            </div>
                        </motion.div>
                    </div>

                    {/* STEP 03 */}
                    <div className="relative flex flex-col md:flex-row items-center justify-between">
                        {/* Central Step Marker */}
                        <motion.div 
                            {...cinematicReveal}
                            className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center bg-neutral-50 dark:bg-background py-6 px-4 z-10"
                        >
                            <span className="text-[12px] font-bold tracking-[0.25em] text-neutral-400 uppercase mb-2">Step</span>
                            <span className="text-6xl font-black text-neutral-800 dark:text-white leading-none">03</span>
                        </motion.div>

                        {/* Mobile Step Marker */}
                        <div className="md:hidden flex flex-col items-center justify-center mb-8">
                            <span className="text-[12px] font-bold tracking-[0.25em] text-neutral-400 uppercase mb-1">Step</span>
                            <span className="text-6xl font-black text-neutral-800 dark:text-white leading-none">03</span>
                        </div>

                        {/* Text (Left) */}
                        <motion.div 
                            {...cinematicReveal}
                            transition={{ ...cinematicReveal.transition, delay: 0.1 }}
                            className="w-full md:w-[45%] flex flex-col text-center md:text-right md:items-end items-center mb-12 md:mb-0 pr-0 md:pr-12"
                        >
                            <h3 className="text-2xl md:text-3xl font-bold text-[#34A853] mb-4">Stay Accountable</h3>
                            <p className="text-sm md:text-base text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-sm">
                                Track your full attendance history, view the live feed of other workers checking in, and request leave easily when needed — keeping everything organized in one place.
                            </p>
                            <div className="mt-8 flex gap-2.5 opacity-30 justify-center md:justify-end w-full">
                                {[...Array(10)].map((_, i) => (
                                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                                ))}
                            </div>
                        </motion.div>

                        {/* Image (Right) */}
                        <motion.div 
                            {...cinematicReveal}
                            transition={{ ...cinematicReveal.transition, delay: 0.2 }}
                            className="w-full md:w-[45%] flex justify-center md:justify-start pl-0 md:pl-12"
                        >
                            <div className="w-64 h-64 md:w-80 md:h-80 rounded-full bg-[#34A853] flex items-center justify-center shadow-2xl shadow-[#34A853]/20 relative">
                                <div className="absolute inset-4 rounded-full border-2 border-white/20" />
                                <Activity className="w-24 h-24 md:w-32 md:h-32 text-white" strokeWidth={1.5} />
                            </div>
                        </motion.div>
                    </div>

                </div>
            </div>
        </section>
    );
}
