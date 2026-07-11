"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    ReactNode,
} from "react";

export type ThemePreference = "light" | "dark" | "system";

// Also read by the no-flash inline script in app/layout.tsx — keep in sync.
export const THEME_STORAGE_KEY = "gavel-theme";

interface ThemeContextType {
    theme: ThemePreference;
    setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function isThemePreference(value: unknown): value is ThemePreference {
    return value === "light" || value === "dark" || value === "system";
}

function applyTheme(theme: ThemePreference) {
    const dark =
        theme === "dark" ||
        (theme === "system" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemePreference>(() => {
        if (typeof window === "undefined") return "light";
        try {
            const stored = localStorage.getItem(THEME_STORAGE_KEY);
            return isThemePreference(stored) ? stored : "light";
        } catch {
            return "light";
        }
    });

    useEffect(() => {
        applyTheme(theme);
        if (theme !== "system") return;
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => applyTheme("system");
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, [theme]);

    const setTheme = useCallback((next: ThemePreference) => {
        setThemeState(next);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
            // Storage unavailable (private mode etc.) — theme still applies
            // for this session via the effect above.
        }
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
