"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    Building2,
    KeyRound,
    Loader2,
    Lock,
    LogOut,
    Plug,
    Settings,
    Shield,
    SlidersHorizontal,
    Sparkles,
} from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import { supabase } from "@/app/lib/supabase";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

const SETTINGS_ITEMS = [
    { href: "/account", label: "General", icon: Settings },
    { href: "/account/features", label: "Features", icon: Sparkles },
    { href: "/account/privacy-data", label: "Privacy & Data", icon: Shield },
    { href: "/account/security", label: "Security", icon: Lock },
    { href: "/account/organization", label: "Organization", icon: Building2 },
    {
        href: "/account/models",
        label: "Model Preferences",
        icon: SlidersHorizontal,
    },
    { href: "/account/api-keys", label: "API Keys", icon: KeyRound },
    { href: "/account/connectors", label: "Connectors", icon: Plug },
];

/**
 * Account menu for the sidebar footer. Wraps the trigger (the
 * avatar/name/email button) and opens upward with the user's email,
 * one item per settings section, and Log out.
 */
export function AccountMenu({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { user, signOut } = useAuth();
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    if (!user) return null;

    const handleLogout = async () => {
        if (isLoggingOut) return;
        setIsLoggingOut(true);
        try {
            await signOut();
            router.push("/login");
        } catch (error) {
            console.error("Sign out failed:", error);
            // Only leave the page if the session is actually gone.
            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session) {
                router.push("/login");
            } else {
                setIsLoggingOut(false);
            }
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent
                side="top"
                align="start"
                sideOffset={6}
                className={
                    "z-[160] w-(--radix-dropdown-menu-trigger-width) min-w-56 " +
                    "bg-white/80 border-white/70 backdrop-blur-xl " +
                    "shadow-[0_6px_17px_rgba(15,23,42,0.1)]"
                }
            >
                {user.email && (
                    <DropdownMenuLabel
                        title={user.email}
                        className="truncate text-xs font-normal text-gray-500"
                    >
                        {user.email}
                    </DropdownMenuLabel>
                )}
                {SETTINGS_ITEMS.map(({ href, label, icon: Icon }) => (
                    <DropdownMenuItem
                        key={href}
                        onSelect={() => router.push(href)}
                        className="text-gray-700"
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="bg-gray-200/80" />
                <DropdownMenuItem
                    disabled={isLoggingOut}
                    onSelect={(event) => {
                        // Keep the menu open so the in-flight state is
                        // visible; it unmounts once the user is cleared.
                        event.preventDefault();
                        void handleLogout();
                    }}
                    className="text-gray-700"
                >
                    {isLoggingOut ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <LogOut className="h-4 w-4" />
                    )}
                    Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
