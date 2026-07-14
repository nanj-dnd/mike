"use client";

import { useState } from "react";
import { supabase } from "@/app/lib/supabase";

/**
 * "Continue with Microsoft" — Supabase's `azure` OAuth provider
 * (Microsoft Entra ID / personal Microsoft accounts). Needs an Azure app
 * registration wired into Supabase Auth, so it's hidden until the
 * deployment sets NEXT_PUBLIC_MICROSOFT_SSO_ENABLED=true.
 *
 * SAML 2.0 domain-based SSO was removed: it requires Supabase's SSO
 * feature to be enabled at the project level (a Team/Enterprise-tier
 * capability configured via the Management API/CLI, not a dashboard
 * toggle), which this deployment doesn't have.
 */

const microsoftSsoEnabled =
    process.env.NEXT_PUBLIC_MICROSOFT_SSO_ENABLED === "true";

export function MicrosoftSignInButton({ label }: { label: string }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!microsoftSsoEnabled) return null;

    const handleClick = async () => {
        setLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: "azure",
                options: {
                    scopes: "email openid profile",
                    redirectTo: `${window.location.origin}/assistant`,
                },
            });
            if (error) throw error;
            // Browser navigates away to Microsoft on success.
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Could not start Microsoft sign-in.",
            );
            setLoading(false);
        }
    };

    return (
        <div className="mt-2">
            <button
                type="button"
                onClick={handleClick}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-none transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 21 21"
                    aria-hidden="true"
                >
                    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
                {loading ? "Redirecting…" : label}
            </button>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
    );
}
