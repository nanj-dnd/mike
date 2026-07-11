import { createServerSupabase } from "./supabase";
import { resolveModel, defaultModelForKeys, type UserApiKeys } from "./llm";
import { getUserApiKeys as getStoredUserApiKeys } from "./userApiKeys";

export type UserModelSettings = {
    title_model: string;
    tabular_model: string;
    legal_research_us: boolean;
    api_keys: UserApiKeys;
};

export async function getUserModelSettings(
    userId: string,
    db?: ReturnType<typeof createServerSupabase>,
): Promise<UserModelSettings> {
    const client = db ?? createServerSupabase();
    const { data } = await client
        .from("user_profiles")
        .select("title_model, tabular_model, legal_research_us")
        .eq("user_id", userId)
        .single();
    const api_keys = await getStoredUserApiKeys(userId, client);

    return {
        // Unless the user explicitly picked a model in Account → Model
        // Preferences, route each task to the first provider (in
        // PROVIDER_PREFERENCE order) that they have an API key for.
        title_model: resolveModel(
            data?.title_model,
            defaultModelForKeys("low", api_keys),
        ),
        tabular_model: resolveModel(
            data?.tabular_model,
            defaultModelForKeys("mid", api_keys),
        ),
        // Indian deployment: US case-law research (CourtListener) is opt-in,
        // off unless the user explicitly enables it.
        legal_research_us:
            (data as { legal_research_us?: boolean | null } | null)
                ?.legal_research_us === true,
        api_keys,
    };
}

export async function getUserApiKeys(
    userId: string,
    db?: ReturnType<typeof createServerSupabase>,
): Promise<UserApiKeys> {
    const client = db ?? createServerSupabase();
    return getStoredUserApiKeys(userId, client);
}
