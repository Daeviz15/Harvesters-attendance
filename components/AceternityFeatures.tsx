"use client";

import { useState, useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { MapPin, Clock, Users, Shield } from "lucide-react";

const features = [
    { 
        id: "location",
        title: "Location Verified", 
        description: "GPS-powered geofencing ensures you're physically present at the church premises before checking in. No spoofing.", 
        className: "md:col-span-2 bg-[#0a0a0a] border-neutral-800", // Dark Wide Card
        textClass: "text-white",
        descClass: "text-neutral-400",
        highlightClass: "bg-white/10 text-white",
        icon: <MapPin className="w-4 h-4" /> 
    },
    { 
        id: "tracking",
        title: "Real-Time Tracking", 
        description: "Instant check-in and check-out with precise timestamps.", 
        className: "md:col-span-1 md:row-span-2 bg-white dark:bg-[#1a1a1a] border-neutral-200 dark:border-neutral-800", // Light Tall Card
        textClass: "text-neutral-900 dark:text-white",
        descClass: "text-neutral-500 dark:text-neutral-400",
        highlightClass: "bg-[#34A853]/20 text-[#34A853] dark:bg-[#34A853]/20 dark:text-[#34A853]",
        icon: <Clock className="w-4 h-4" /> 
    },
    { 
        id: "feed",
        title: "Live Feed", 
        description: "See who's checking in across all departments in real-time.", 
        className: "md:col-span-1 bg-white dark:bg-[#1a1a1a] border-neutral-200 dark:border-neutral-800", // Light Square Card
        textClass: "text-neutral-900 dark:text-white",
        descClass: "text-neutral-500 dark:text-neutral-400",
        highlightClass: "bg-[#34A853]/20 text-[#34A853] dark:bg-[#34A853]/20 dark:text-[#34A853]",
        icon: <Users className="w-4 h-4" /> 
    },
    { 
        id: "security",
        title: "Enterprise Security", 
        description: "Built on Supabase with end-to-end encryption.", 
        className: "md:col-span-1 bg-[#0a0a0a] border-neutral-800", // Dark Square Card
        textClass: "text-white",
        descClass: "text-neutral-400",
        highlightClass: "bg-white/10 text-white",
        icon: <Shield className="w-4 h-4" /> 
    },
];

export default function AceternityFeatures() {
    return (
        <section className="relative z-10 max-w-6xl mx-auto px-6 py-20" style={{ perspective: "1000px" }}>
            <div className="mb-16">
                <motion.h2 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.6 }}
                    className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900 dark:text-white"
                >
                    Why Harvesters Attendance?
                </motion.h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 md:grid-rows-2 gap-4 md:gap-6 auto-rows-[280px]">
                {features.map((feature, idx) => (
                    <TiltCard key={feature.id} feature={feature} idx={idx} />
                ))}
            </div>
        </section>
    );
}

function TiltCard({ feature, idx }: { feature: typeof features[0], idx: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30 });
    const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30 });

    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["15deg", "-15deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-15deg", "15deg"]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const xPct = mouseX / width - 0.5;
        const yPct = mouseY / height - 0.5;
        x.set(xPct);
        y.set(yPct);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <motion.div
            ref={ref}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
                rotateX,
                rotateY,
                transformStyle: "preserve-3d",
            }}
            className={`relative group rounded-[2rem] p-8 border overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-2xl ${feature.className}`}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: idx * 0.15 }}
        >
            {/* Background Abstract Graphics */}
            <div className="absolute inset-0 pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity duration-500" style={{ transform: "translateZ(30px)" }}>
                {feature.id === 'location' && (
                    <div className="absolute right-0 top-0 bottom-0 w-1/2 overflow-hidden">
                        <div className="absolute right-10 top-1/2 -translate-y-1/2 w-40 h-40 border border-white/10 rounded-full flex items-center justify-center">
                            <div className="w-24 h-24 border border-white/20 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
                            <div className="w-8 h-8 bg-[#34A853]/30 rounded-full" />
                        </div>
                        {/* Grid dots */}
                        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.1) 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                    </div>
                )}
                {feature.id === 'tracking' && (
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-3/4 flex flex-col items-center justify-between py-4">
                        <div className="w-0.5 h-full bg-gradient-to-b from-transparent via-[#34A853]/30 to-transparent absolute" />
                        <div className="w-3 h-3 rounded-full bg-[#34A853] z-10 shadow-[0_0_15px_rgba(52,168,83,0.5)]" />
                        <div className="w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-600 z-10" />
                        <div className="w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-600 z-10" />
                    </div>
                )}
                {feature.id === 'feed' && (
                    <div className="absolute -right-4 -bottom-4 w-32 h-32 opacity-20 group-hover:opacity-60 transition-opacity">
                        <Users className="w-full h-full text-[#34A853]" />
                    </div>
                )}
                {feature.id === 'security' && (
                    <div className="absolute right-4 bottom-4 w-24 h-24 flex items-center justify-center">
                        <div className="absolute w-full h-full border-2 border-white/5 rounded-xl rotate-12 group-hover:rotate-45 transition-transform duration-700" />
                        <div className="absolute w-full h-full border-2 border-white/5 rounded-xl -rotate-12 group-hover:-rotate-45 transition-transform duration-700" />
                        <Shield className="w-8 h-8 text-white/20" />
                    </div>
                )}
            </div>

            {/* Card Content Top */}
            <div className="relative z-10 w-full md:w-2/3" style={{ transform: "translateZ(60px)" }}>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-sm tracking-wide mb-4 ${feature.highlightClass}`}>
                    {feature.icon}
                    {feature.title}
                </div>
                <p className={`text-[15px] leading-relaxed font-medium ${feature.descClass}`}>
                    {feature.description}
                </p>
            </div>

        </motion.div>
    );
}
