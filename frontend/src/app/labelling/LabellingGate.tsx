"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LabelLab } from "./LabelLab";
import { useAuth } from "@/app/contexts/AuthContext";
import { supabase } from "@/app/lib/supabase";

type GateState = "checking" | "ready" | "error";

interface LabelLabSessionResponse {
    viewer: { id: string; email: string; name: string };
    expiresAt: string;
}

async function establishLabelLabSession(accessToken: string) {
    const response = await fetch("/labelling/api/session", {
        method: "POST",
        credentials: "same-origin",
        headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            "X-AMP-Lab-CSRF": "1",
        },
    });

    const payload = (await response.json().catch(() => null)) as
        | (Partial<LabelLabSessionResponse> & {
              error?: string;
              detail?: string;
          })
        | null;

    if (!response.ok) {
        throw new Error(
            payload?.detail ??
                payload?.error ??
                "Could not open the secure labeling workspace.",
        );
    }

    if (!payload?.expiresAt || !Number.isFinite(Date.parse(payload.expiresAt))) {
        throw new Error("The secure labeling session returned an invalid expiry.");
    }

    return payload as LabelLabSessionResponse;
}

async function clearLabelLabSession() {
    await fetch("/labelling/api/session", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "X-AMP-Lab-CSRF": "1" },
    });
}

export function LabellingGate() {
    const router = useRouter();
    const { authLoading, isAuthenticated } = useAuth();
    const [gateState, setGateState] = useState<GateState>("checking");
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    const [sessionExpiresAt, setSessionExpiresAt] = useState("");

    const openSession = useCallback(async () => {
        setGateState("checking");
        setError("");

        const {
            data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
            await clearLabelLabSession().catch(() => undefined);
            router.replace("/login?next=/labelling");
            return;
        }

        try {
            const labSession = await establishLabelLabSession(
                session.access_token,
            );
            setSessionExpiresAt(labSession.expiresAt);
            setGateState("ready");
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught.message
                    : "Could not open the secure labeling workspace.",
            );
            setGateState("error");
        }
    }, [router]);

    useEffect(() => {
        if (authLoading) return;
        if (!isAuthenticated) {
            void clearLabelLabSession()
                .catch(() => undefined)
                .finally(() => router.replace("/login?next=/labelling"));
            return undefined;
        }
        const timer = window.setTimeout(() => {
            void openSession();
        }, 0);
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (event !== "TOKEN_REFRESHED" || !session?.access_token) return;
            void establishLabelLabSession(session.access_token)
                .then((labSession) => setSessionExpiresAt(labSession.expiresAt))
                .catch((caught) => {
                    setError(
                        caught instanceof Error
                            ? caught.message
                            : "Your secure labeling session expired.",
                    );
                    setGateState("error");
                });
        });
        return () => {
            window.clearTimeout(timer);
            subscription.unsubscribe();
        };
    }, [attempt, authLoading, isAuthenticated, openSession, router]);

    useEffect(() => {
        if (gateState !== "ready" || !sessionExpiresAt) return;
        const expiresAtMs = Date.parse(sessionExpiresAt);
        if (!Number.isFinite(expiresAtMs)) return;

        const refreshDelayMs = Math.max(
            5_000,
            expiresAtMs - Date.now() - 90_000,
        );
        const timer = window.setTimeout(() => {
            void supabase.auth
                .getSession()
                .then(async ({ data: { session } }) => {
                    if (!session?.access_token) {
                        await clearLabelLabSession().catch(() => undefined);
                        router.replace("/login?next=/labelling");
                        return;
                    }
                    const labSession = await establishLabelLabSession(
                        session.access_token,
                    );
                    setSessionExpiresAt(labSession.expiresAt);
                })
                .catch((caught) => {
                    setError(
                        caught instanceof Error
                            ? caught.message
                            : "Your secure labeling session expired.",
                    );
                    setGateState("error");
                });
        }, refreshDelayMs);

        return () => window.clearTimeout(timer);
    }, [gateState, router, sessionExpiresAt]);

    const exitLab = useCallback(async () => {
        try {
            await clearLabelLabSession();
        } finally {
            router.push("/lawyering");
        }
    }, [router]);

    if (gateState === "ready") {
        return (
            <div className="amp-labelling">
                <LabelLab onExit={exitLab} />
            </div>
        );
    }

    return (
        <main className="amp-labelling amp-session-gate">
            <section className="amp-session-card" aria-live="polite">
                <div className="amp-session-mark">amp</div>
                {gateState === "checking" ? (
                    <>
                        <span className="amp-session-spinner" aria-hidden="true" />
                        <h1>Opening Label Lab</h1>
                        <p>Establishing your secure labeling session…</p>
                    </>
                ) : (
                    <>
                        <h1>Label Lab could not open</h1>
                        <p>{error}</p>
                        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                            Try again
                        </button>
                    </>
                )}
            </section>
        </main>
    );
}
