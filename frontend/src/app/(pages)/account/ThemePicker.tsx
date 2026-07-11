"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/app/lib/utils";
import { useTheme, type ThemePreference } from "@/app/contexts/ThemeContext";

const OPTIONS: {
    value: ThemePreference;
    label: string;
    icon: typeof Sun;
}[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
];

export function ThemePicker() {
    const { theme, setTheme } = useTheme();
    // The stored preference is only known on the client; highlight the
    // active option after mount to keep server and client HTML identical.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    return (
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
            {OPTIONS.map((option) => {
                const active = mounted && theme === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setTheme(option.value)}
                        className={cn(
                            "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                            active
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-gray-500 hover:text-gray-900",
                        )}
                    >
                        <option.icon className="h-3.5 w-3.5 shrink-0" />
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
