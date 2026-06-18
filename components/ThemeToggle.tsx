"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sun, Moon, Laptop } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
    const [mounted, setMounted] = useState(false);
    const { theme, setTheme } = useTheme();

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        // Fallback placeholder during SSR/hydration to avoid layout shift
        return (
            <div className="w-[100px] h-8 bg-neutral-200/50 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-full animate-pulse" />
        );
    }

    const options = [
        { id: "light", icon: Sun, label: "Light" },
        { id: "system", icon: Laptop, label: "System" },
        { id: "dark", icon: Moon, label: "Dark" }
    ] as const;

    return (
        <div className="relative flex items-center bg-neutral-200/60 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-full p-[3px] select-none shadow-sm transition-colors duration-300">
            {options.map((opt) => {
                const Icon = opt.icon;
                const isActive = theme === opt.id;
                return (
                    <button
                        key={opt.id}
                        onClick={() => setTheme(opt.id)}
                        className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-full transition-colors duration-300 ${
                            isActive 
                                ? "text-neutral-900 dark:text-white" 
                                : "text-neutral-500 hover:text-neutral-800 dark:text-white/40 dark:hover:text-white/70"
                        }`}
                        title={opt.label}
                        aria-label={`Switch to ${opt.label} theme`}
                    >
                        {isActive && (
                            <motion.span
                                layoutId="activeThemeBubble"
                                className="absolute inset-0 bg-white dark:bg-white/10 rounded-full shadow-sm"
                                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                            />
                        )}
                        <Icon className="w-4 h-4 relative z-20" />
                    </button>
                );
            })}
        </div>
    );
}
