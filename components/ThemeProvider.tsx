"use client";

import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Use useLayoutEffect on client, useEffect on server (SSR safety)
const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>("system");

    // Read saved theme from localStorage synchronously on mount
    useIsomorphicLayoutEffect(() => {
        const savedTheme = (localStorage.getItem("theme") as Theme) || "system";
        setThemeState(savedTheme);
        applyTheme(savedTheme);
    }, []);

    // Re-apply theme whenever it changes
    useEffect(() => {
        applyTheme(theme);

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

function applyTheme(currentTheme: Theme) {
    const root = document.documentElement;
    if (currentTheme === "system") {
        const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        root.classList.toggle("dark", systemPrefersDark);
    } else {
        root.classList.toggle("dark", currentTheme === "dark");
    }
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
