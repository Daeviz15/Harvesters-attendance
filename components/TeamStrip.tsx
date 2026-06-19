"use client";

import { motion } from "framer-motion";

const team = [
    {
        initials: "MJ",
        name: "Mr. Johnwell",
        role: "Project Lead",
    },
    {
        initials: "DF",
        name: "David Felix",
        role: "Lead Developer",
    },
    {
        initials: "SA",
        name: "Samson",
        role: "Developer",
    },
];

export default function TeamStrip() {
    return (
        <section className="relative z-10 w-full py-16">
            <div className="max-w-4xl mx-auto px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-10"
                >
                    <p className="text-[11px] font-bold tracking-[0.35em] uppercase text-neutral-400 dark:text-white/30">
                        Built with ❤️ by
                    </p>
                </motion.div>

                <div className="flex items-center justify-center gap-8 md:gap-16 flex-wrap">
                    {team.map((member, idx) => (
                        <motion.div
                            key={member.name}
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{ duration: 0.5, delay: idx * 0.1 }}
                            className="flex items-center gap-3 group"
                        >
                            {/* Initials Avatar */}
                            <div className="w-10 h-10 rounded-full bg-[#0a0a0a] dark:bg-white/10 border border-neutral-200 dark:border-white/10 flex items-center justify-center group-hover:border-[#34A853]/50 group-hover:shadow-[0_0_15px_rgba(52,168,83,0.15)] transition-all duration-300">
                                <span className="text-xs font-bold text-neutral-500 dark:text-white/50 group-hover:text-[#34A853] transition-colors duration-300">
                                    {member.initials}
                                </span>
                            </div>

                            {/* Name & Role */}
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-neutral-800 dark:text-white/80 leading-tight">
                                    {member.name}
                                </span>
                                <span className="text-[11px] font-medium text-neutral-400 dark:text-white/30 leading-tight">
                                    {member.role}
                                </span>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
