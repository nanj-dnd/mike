"use client";

import { useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

/**
 * Enterprise sign-in options rendered under the Google button on the
 * login and signup pages.
 *
 * - "Continue with Microsoft" — Supabase's `azure` OAuth provider
 *   (Microsoft Entra ID / personal Microsoft accounts). Needs an Azure
 *   app registration wired into Supabase Auth, so it's hidden until the
 *   deployment sets NEXT_PUBLIC_MICROSOFT_SSO_ENABLED=true.
 * - "Use single sign-on (SSO)" — SAML 2.0 via supabase.auth.signInWithSSO,
 *   matched by the work-email domain. Always visible: firms evaluating the
 *   product look for it, and an unregistered domain gets a clear message
 *   rather than an error page.
 */

const microsoftSsoEnabled =
    process.env.NEXT_PUBLIC_MICROSOFT_SSO_ENABLED === "true";

const ssoInputClassName =
    "rounded-lg border border-transparent bg-gray-100 px-3 shadow-none focus-visible:border-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300/45";

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

export function SsoDomainSignIn() {
    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const domain = email.split("@")[1]?.trim().toLowerCase();
        if (!domain) {
            setError("Enter your work email, e.g. you@yourfirm.com");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase.auth.signInWithSSO({
                domain,
                options: {
                    redirectTo: `${window.location.origin}/assistant`,
                },
            });
            if (error) throw error;
            if (data?.url) {
                window.location.href = data.url;
                return;
            }
            throw new Error("SSO did not return a sign-in URL.");
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "SSO sign-in failed.";
            setError(
                /no sso provider|not found|not enabled/i.test(message)
                    ? `Single sign-on isn't set up for ${domain} yet. Ask your admin to contact support, or sign in with email instead.`
                    : message,
            );
            setLoading(false);
        }
    };

    if (!open) {
        return (
            <div className="mt-4 text-center">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="text-xs font-medium text-gray-500 underline-offset-2 transition-colors hover:text-gray-900 hover:underline"
                >
                    Use single sign-on (SSO)
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="mt-4 space-y-2">
            <label
                htmlFor="sso-email"
                className="block text-sm font-medium text-gray-700"
            >
                Work email
            </label>
            <div className="flex gap-2">
                <Input
                    id="sso-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourfirm.com"
                    required
                    autoFocus
                    className={`w-full ${ssoInputClassName}`}
                />
                <Button
                    type="submit"
                    disabled={loading}
                    className="shrink-0 bg-black text-white hover:bg-gray-900"
                >
                    {loading ? "Redirecting…" : "Continue"}
                </Button>
            </div>
            <p className="text-xs text-gray-400">
                We&apos;ll redirect you to your firm&apos;s identity provider
                (SAML 2.0).
            </p>
            {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
    );
}
