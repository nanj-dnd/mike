import type { ApiKeyProvider, ApiKeyState } from "@/app/lib/mikeApi";

// First-login onboarding: users are directed to Account → API Keys once
// (Gavel is bring-your-own-key), then on to Model Preferences after they
// save their first key. Tracked per device in localStorage — no server
// round-trip, and users who already have a key are marked done on sight.

export const ONBOARDING_PARAM = "onboarding";

const DONE_KEY = "gavel-onboarded";

export const MODEL_KEY_PROVIDERS: readonly ApiKeyProvider[] = [
    "claude",
    "gemini",
    "openai",
    "openrouter",
];

export function hasAnyModelApiKey(apiKeys: ApiKeyState | undefined): boolean {
    if (!apiKeys) return false;
    return MODEL_KEY_PROVIDERS.some((p) => apiKeys[p]?.configured);
}

export function isOnboardingDone(): boolean {
    try {
        return localStorage.getItem(DONE_KEY) === "1";
    } catch {
        // Storage unavailable — treat as done rather than redirect on
        // every page load.
        return true;
    }
}

export function markOnboardingDone() {
    try {
        localStorage.setItem(DONE_KEY, "1");
    } catch {
        // Ignore; worst case the redirect happens again next session.
    }
}

/** Whether the current URL carries ?onboarding=1. Client-only. */
export function isOnboardingQueryActive(): boolean {
    if (typeof window === "undefined") return false;
    return (
        new URLSearchParams(window.location.search).get(ONBOARDING_PARAM) ===
        "1"
    );
}
