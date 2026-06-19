"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Navigation, ArrowRight } from "lucide-react";

const campuses = [
    {
        id: "globe",
        name: "Harvesters Globe",
        address: "Lekki - Epe Expy, Lekki Peninsula II, Lagos",
        directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=Harvesters+Globe+Lekki",
        mapUrl: "https://maps.google.com/maps?q=Harvesters%20Globe%20Lekki&t=&z=14&ie=UTF8&iwloc=&output=embed",
    },
    {
        id: "gbagada",
        name: "Harvesters Gbagada",
        address: "Plot 5, GameDay Blendin Venue, 7 Gbagada - Oworonshoki Expy",
        directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=Harvesters+International+Christian+Center+Gbagada",
        mapUrl: "https://maps.google.com/maps?q=Harvesters%20International%20Christian%20Center%20Gbagada&t=&z=14&ie=UTF8&iwloc=&output=embed",
    },
    {
        id: "lekki",
        name: "Harvesters Lekki",
        address: "Block 94 The Providence St, off Adewunmi Adebimpe Drive, Lekki Phase 1",
        directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=Harvesters+International+Christian+Centre+Lekki",
        mapUrl: "https://maps.google.com/maps?q=Harvesters%20International%20Christian%20Centre%20Lekki&t=&z=14&ie=UTF8&iwloc=&output=embed",
    }
];

export default function VisitUs() {
    const [hoveredId, setHoveredId] = useState<string | null>("globe");

    return (
        <section className="relative z-10 w-full py-24 overflow-hidden">
            <div className="max-w-6xl mx-auto px-6">

                {/* Header Section */}
                <div className="mb-16 md:mb-24 max-w-2xl">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.6 }}
                        className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-900 dark:text-white mb-6 leading-tight"
                    >
                        You Are Always <span className="text-[#34A853]">Welcome.</span>
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-lg text-neutral-600 dark:text-neutral-400 font-medium"
                    >
                        Join us on Wednesdays and Sundays at any of our campuses. Experience God, find your community, and grow in your spiritual journey.
                    </motion.p>
                </div>

                {/* Desktop Interactive Expanding Gallery */}
                <div className="hidden md:flex h-[500px] w-full gap-4">
                    {campuses.map((campus) => {
                        const isActive = hoveredId === campus.id;

                        return (
                            <motion.div
                                key={campus.id}
                                layout
                                onMouseEnter={() => setHoveredId(campus.id)}
                                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                className="relative rounded-[2rem] overflow-hidden cursor-pointer bg-[#0a0a0a] border border-white/10 shadow-2xl flex flex-col justify-end group"
                                style={{
                                    flex: isActive ? 3 : 1
                                }}
                            >
                                {/* Pre-loaded Google Map — always mounted, visibility toggled via CSS */}
                                <div
                                    className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-700"
                                    style={{ opacity: isActive ? 1 : 0 }}
                                >
                                    <iframe
                                        src={campus.mapUrl}
                                        className="w-full h-full border-0 grayscale opacity-50"
                                        loading="lazy"
                                        title={`Map of ${campus.name}`}
                                    />
                                    {/* Gradient Overlay for Text Legibility */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent" />
                                </div>

                                {/* Rotating Title for inactive state (Centered) */}
                                <AnimatePresence>
                                    {!isActive && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.3 }}
                                            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                                        >
                                            <h3 className="text-3xl font-bold text-white/40 -rotate-90 whitespace-nowrap tracking-[0.3em] uppercase">
                                                {campus.name.replace('Harvesters ', '')}
                                            </h3>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Active Content */}
                                <div className="relative z-10 p-8 h-full flex flex-col justify-end pointer-events-none w-2/3">
                                    <AnimatePresence>
                                        {isActive && (
                                            <motion.div
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -20 }}
                                                transition={{ duration: 0.4, delay: 0.1 }}
                                                className="pointer-events-auto"
                                            >
                                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-white font-medium text-sm mb-4">
                                                    <MapPin className="w-4 h-4 text-[#34A853]" />
                                                    Campus
                                                </div>
                                                <h3 className="text-4xl font-bold text-white mb-4 tracking-tight">
                                                    {campus.name}
                                                </h3>
                                                <p className="text-neutral-300 font-medium leading-relaxed max-w-sm mb-8">
                                                    {campus.address}
                                                </p>
                                                <a
                                                    href={campus.directionsUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 bg-[#34A853] hover:bg-[#2e9347] text-white px-6 py-3 rounded-full font-semibold transition-colors w-fit group/btn shadow-[0_0_20px_rgba(52,168,83,0.3)]"
                                                >
                                                    <Navigation className="w-4 h-4" />
                                                    Get Directions
                                                    <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                                                </a>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Mobile Vertical Accordion (rendered below desktop gallery) */}
                <div className="flex md:hidden flex-col gap-4">
                    {campuses.map((campus) => {
                        const isActive = hoveredId === campus.id;

                        return (
                            <motion.div
                                key={campus.id}
                                layout
                                onClick={() => setHoveredId(isActive ? null : campus.id)}
                                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                className="relative rounded-3xl overflow-hidden cursor-pointer bg-[#0a0a0a] border border-white/10 shadow-lg"
                                style={{
                                    height: isActive ? "380px" : "100px"
                                }}
                            >
                                {/* Pre-loaded Google Map — always mounted, visibility toggled via CSS */}
                                <div
                                    className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-700"
                                    style={{ opacity: isActive ? 1 : 0 }}
                                >
                                    <iframe
                                        src={campus.mapUrl}
                                        className="w-full h-full border-0 grayscale opacity-50"
                                        loading="lazy"
                                        title={`Map of ${campus.name}`}
                                    />
                                    {/* Gradient Overlay (Bottom up for mobile) */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/90 to-transparent" />
                                </div>

                                <div className="relative z-10 p-6 h-full flex flex-col justify-end">
                                    {!isActive && (
                                        <div className="flex items-center justify-between h-full">
                                            <h3 className="text-2xl font-bold text-white/80 tracking-tight">
                                                {campus.name.replace('Harvesters ', '')}
                                            </h3>
                                            <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white/50">
                                                <MapPin className="w-5 h-5" />
                                            </div>
                                        </div>
                                    )}

                                    <AnimatePresence>
                                        {isActive && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 20 }}
                                                transition={{ duration: 0.3, delay: 0.1 }}
                                                className="h-full flex flex-col justify-end pointer-events-auto"
                                            >
                                                <h3 className="text-3xl font-bold text-white mb-3 tracking-tight">
                                                    {campus.name}
                                                </h3>
                                                <p className="text-neutral-300 text-sm font-medium leading-relaxed mb-6">
                                                    {campus.address}
                                                </p>
                                                <a
                                                    href={campus.directionsUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 bg-[#34A853] text-white px-5 py-2.5 rounded-full font-semibold text-sm w-fit group/btn shadow-[0_0_20px_rgba(52,168,83,0.3)]"
                                                >
                                                    <Navigation className="w-4 h-4" />
                                                    Get Directions
                                                    <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                                                </a>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Visit Official Website CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="mt-12 flex justify-center"
                >
                    <a
                        href="https://harvestersng.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-3 border border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full font-semibold transition-all duration-300 group/web"
                    >
                        Visit Official Website
                        <ArrowRight className="w-4 h-4 group-hover/web:translate-x-1 transition-transform" />
                    </a>
                </motion.div>

            </div>
        </section>
    );
}
