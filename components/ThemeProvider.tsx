"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>("system");

    useEffect(() => {
        // Read theme choice on mount (safe from hydration errors)
        const savedTheme = (localStorage.getItem("theme") as Theme) || "system";
        setThemeState(savedTheme);
    }, []);

    useEffect(() => {
        const root = document.documentElement;

        const applyTheme = (currentTheme: Theme) => {
            if (currentTheme === "system") {
                const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                if (systemPrefersDark) {
                    root.classList.add("dark");
                } else {
                    root.classList.remove("dark");
                }
            } else if (currentTheme === "dark") {
                root.classList.add("dark");
            } else {
                root.classList.remove("dark");
            }
        };

        applyTheme(theme);

        // Listen for system changes if system theme is selected
        if (theme === "system") {
            const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
            const handleMediaChange = () => applyTheme("system");
            mediaQuery.addEventListener("change", handleMediaChange);
            return () => mediaQuery.removeEventListener("change", handleMediaChange);
        }
    }, [theme]);

    const setTheme = (newTheme: Theme) => {
        localStorage.setItem("theme", newTheme);
        setThemeState(newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
