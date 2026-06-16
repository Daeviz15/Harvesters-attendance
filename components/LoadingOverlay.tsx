"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

interface LoadingOverlayProps {
    isOpen: boolean;
}

export default function LoadingOverlay({ isOpen }: LoadingOverlayProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/40 backdrop-blur-xl"
                >
                    {/* Animated glowing backdrop for the logo */}
                    <motion.div
                        animate={{ 
                            scale: [1, 1.2, 1],
                            opacity: [0.5, 0.8, 0.5]
                        }}
                        transition={{ 
                            duration: 2, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                        }}
                        className="absolute w-40 h-40 bg-[#34A853]/20 rounded-full blur-3xl pointer-events-none"
                    />

                    {/* Logo Container */}
                    <motion.div
                        animate={{ 
                            y: [0, -10, 0],
                        }}
                        transition={{ 
                            duration: 3, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                        }}
                        className="relative h-24 w-40 z-10"
                    >
                        <Image
                            src="/logo.png"
                            alt="Processing..."
                            fill
                            sizes="160px"
                            className="object-contain"
                            priority
                        />
                    </motion.div>
                    
                    {/* Minimalist text */}
                    <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mt-6 text-[13px] font-medium tracking-[0.2em] uppercase text-white/50 relative z-10"
                    >
                        Authenticating
                    </motion.p>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
