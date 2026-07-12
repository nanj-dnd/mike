import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || "";

/**
 * Lazily-initialized Supabase client. Constructing the client at module
 * scope made `next build` crash while prerendering any page that imports
 * this file when NEXT_PUBLIC_SUPABASE_URL isn't set at build time
 * (supabase-js throws "supabaseUrl is required" in its constructor).
 * No prerender ever *calls* Supabase — every use is inside an effect or
 * event handler — so deferring construction to first property access
 * keeps builds environment-independent without changing any call site.
 */
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
    if (!client) {
        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error(
                "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY at build time.",
            );
        }
        client = createClient(supabaseUrl, supabaseAnonKey);
    }
    return client;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        const real = getClient() as unknown as Record<
            string | symbol,
            unknown
        >;
        const value = real[prop];
        return typeof value === "function" ? value.bind(real) : value;
    },
});
