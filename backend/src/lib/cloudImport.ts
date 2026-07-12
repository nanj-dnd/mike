import crypto from "crypto";
import { createServerSupabase } from "./supabase";
import { decryptString, encryptString } from "./mcp/client";
import { ALLOWED_DOCUMENT_TYPES } from "./documentTypes";
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from "./upload";

/**
 * Cloud document import: connect a Google Drive or OneDrive account via
 * OAuth (tokens encrypted at rest like user API keys), browse/search
 * files server-side, and pull selected files through the normal document
 * pipeline. Providers activate per deployment via env client credentials;
 * unconfigured providers are reported as such and hidden by the UI.
 *
 * Google-native files (Docs/Sheets/Slides) are supported by exporting
 * them to docx/xlsx/pptx at download time.
 */

export type CloudProvider = "google_drive" | "onedrive";
export const CLOUD_PROVIDERS: CloudProvider[] = ["google_drive", "onedrive"];

type Db = ReturnType<typeof createServerSupabase>;

export class CloudImportError extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.name = "CloudImportError";
        this.status = status;
    }
}

export function isCloudProvider(value: string): value is CloudProvider {
    return (CLOUD_PROVIDERS as string[]).includes(value);
}

function providerCredentials(provider: CloudProvider) {
    if (provider === "google_drive") {
        return {
            clientId: process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() || null,
            clientSecret:
                process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() || null,
        };
    }
    return {
        clientId: process.env.ONEDRIVE_CLIENT_ID?.trim() || null,
        clientSecret: process.env.ONEDRIVE_CLIENT_SECRET?.trim() || null,
    };
}

export function isProviderConfigured(provider: CloudProvider): boolean {
    const { clientId, clientSecret } = providerCredentials(provider);
    return !!clientId && !!clientSecret;
}

export function cloudOAuthCallbackUrl(): string {
    const base = (
        process.env.API_PUBLIC_URL ||
        process.env.BACKEND_URL ||
        `http://localhost:${process.env.PORT ?? "3001"}`
    ).replace(/\/+$/, "");
    return `${base}/cloud-import/oauth/callback`;
}

// ---------- Signed OAuth state (no server-side session needed) ----------

const STATE_TTL_MS = 10 * 60 * 1000;

function stateKey(): Buffer {
    const secret = process.env.USER_API_KEYS_ENCRYPTION_SECRET;
    if (!secret) {
        throw new Error("USER_API_KEYS_ENCRYPTION_SECRET is not configured");
    }
    return crypto.scryptSync(secret, "gavel-cloud-import-state-v1", 32);
}

export interface CloudOAuthState {
    userId: string;
    provider: CloudProvider;
    issuedAt: number;
    nonce: string;
}

export function signOAuthState(
    payload: Omit<CloudOAuthState, "issuedAt" | "nonce">,
): string {
    const state: CloudOAuthState = {
        ...payload,
        issuedAt: Date.now(),
        nonce: crypto.randomBytes(12).toString("base64url"),
    };
    const body = Buffer.from(JSON.stringify(state)).toString("base64url");
    const signature = crypto
        .createHmac("sha256", stateKey())
        .update(body)
        .digest("base64url");
    return `${body}.${signature}`;
}

export function verifyOAuthState(raw: string): CloudOAuthState {
    const [body, signature] = raw.split(".");
    if (!body || !signature) {
        throw new CloudImportError("Invalid OAuth state.");
    }
    const expected = crypto
        .createHmac("sha256", stateKey())
        .update(body)
        .digest("base64url");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        throw new CloudImportError("OAuth state signature mismatch.");
    }
    let parsed: CloudOAuthState;
    try {
        parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
        throw new CloudImportError("Malformed OAuth state.");
    }
    if (!parsed.userId || !isCloudProvider(parsed.provider)) {
        throw new CloudImportError("Malformed OAuth state.");
    }
    if (Date.now() - parsed.issuedAt > STATE_TTL_MS) {
        throw new CloudImportError(
            "OAuth state expired — start the connection again.",
        );
    }
    return parsed;
}

// ---------- Authorization and token exchange ----------

export function authorizationUrl(
    provider: CloudProvider,
    state: string,
): string {
    const { clientId } = providerCredentials(provider);
    if (!clientId) {
        throw new CloudImportError(
            "This provider is not configured on this deployment.",
            503,
        );
    }
    if (provider === "google_drive") {
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: cloudOAuthCallbackUrl(),
            response_type: "code",
            scope: "https://www.googleapis.com/auth/drive.readonly email",
            access_type: "offline",
            prompt: "consent",
            state,
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    }
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: cloudOAuthCallbackUrl(),
        response_type: "code",
        scope: "Files.Read User.Read offline_access",
        state,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

function tokenEndpoint(provider: CloudProvider): string {
    return provider === "google_drive"
        ? "https://oauth2.googleapis.com/token"
        : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
}

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
}

async function requestTokens(
    provider: CloudProvider,
    grant: Record<string, string>,
): Promise<TokenResponse> {
    const { clientId, clientSecret } = providerCredentials(provider);
    if (!clientId || !clientSecret) {
        throw new CloudImportError(
            "This provider is not configured on this deployment.",
            503,
        );
    }
    const response = await fetch(tokenEndpoint(provider), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            ...grant,
        }),
    });
    if (!response.ok) {
        const text = (await response.text()).slice(0, 300);
        throw new CloudImportError(
            `Token exchange with ${providerLabel(provider)} failed: ${text}`,
            502,
        );
    }
    const tokens = (await response.json()) as TokenResponse;
    if (!tokens.access_token) {
        throw new CloudImportError(
            `${providerLabel(provider)} did not return an access token.`,
            502,
        );
    }
    return tokens;
}

export function providerLabel(provider: CloudProvider): string {
    return provider === "google_drive" ? "Google Drive" : "OneDrive";
}

async function fetchAccountEmail(
    provider: CloudProvider,
    accessToken: string,
): Promise<string | null> {
    try {
        if (provider === "google_drive") {
            const response = await fetch(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                { headers: { Authorization: `Bearer ${accessToken}` } },
            );
            if (!response.ok) return null;
            const info = (await response.json()) as { email?: string };
            return info.email ?? null;
        }
        const response = await fetch("https://graph.microsoft.com/v1.0/me", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return null;
        const me = (await response.json()) as {
            mail?: string | null;
            userPrincipalName?: string | null;
        };
        return me.mail ?? me.userPrincipalName ?? null;
    } catch {
        return null;
    }
}

// ---------- Encrypted account storage ----------

interface AccountRow {
    id: string;
    user_id: string;
    provider: CloudProvider;
    account_email: string | null;
    encrypted_access_token: string | null;
    access_token_iv: string | null;
    access_token_tag: string | null;
    encrypted_refresh_token: string | null;
    refresh_token_iv: string | null;
    refresh_token_tag: string | null;
    access_token_expires_at: string | null;
}

function expiryFromNow(expiresIn?: number): string | null {
    if (!expiresIn || !Number.isFinite(expiresIn)) return null;
    return new Date(Date.now() + expiresIn * 1000).toISOString();
}

export async function completeOAuth(
    db: Db,
    state: CloudOAuthState,
    code: string,
): Promise<void> {
    const tokens = await requestTokens(state.provider, {
        grant_type: "authorization_code",
        code,
        redirect_uri: cloudOAuthCallbackUrl(),
    });
    const accountEmail = await fetchAccountEmail(
        state.provider,
        tokens.access_token,
    );

    const access = encryptString(tokens.access_token);
    const refresh = tokens.refresh_token
        ? encryptString(tokens.refresh_token)
        : null;
    const { error } = await db.from("gavel_cloud_import_accounts").upsert(
        {
            user_id: state.userId,
            provider: state.provider,
            account_email: accountEmail,
            encrypted_access_token: access.encrypted,
            access_token_iv: access.iv,
            access_token_tag: access.tag,
            // Providers only return a refresh token on the first consent;
            // keep the stored one when a re-connect omits it.
            ...(refresh
                ? {
                      encrypted_refresh_token: refresh.encrypted,
                      refresh_token_iv: refresh.iv,
                      refresh_token_tag: refresh.tag,
                  }
                : {}),
            access_token_expires_at: expiryFromNow(tokens.expires_in),
            updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" },
    );
    if (error) throw error;
}

export async function getAccount(
    db: Db,
    userId: string,
    provider: CloudProvider,
): Promise<AccountRow | null> {
    const { data } = await db
        .from("gavel_cloud_import_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("provider", provider)
        .maybeSingle();
    return (data as AccountRow | null) ?? null;
}

export async function listAccounts(
    db: Db,
    userId: string,
): Promise<
    {
        provider: CloudProvider;
        configured: boolean;
        connected: boolean;
        accountEmail: string | null;
    }[]
> {
    let rows: AccountRow[] = [];
    const { data, error } = await db
        .from("gavel_cloud_import_accounts")
        .select("*")
        .eq("user_id", userId);
    if (!error) rows = (data ?? []) as AccountRow[];
    return CLOUD_PROVIDERS.map((provider) => {
        const row = rows.find((r) => r.provider === provider);
        return {
            provider,
            configured: isProviderConfigured(provider),
            connected: !!row?.encrypted_access_token,
            accountEmail: row?.account_email ?? null,
        };
    });
}

export async function disconnectAccount(
    db: Db,
    userId: string,
    provider: CloudProvider,
): Promise<void> {
    const { error } = await db
        .from("gavel_cloud_import_accounts")
        .delete()
        .eq("user_id", userId)
        .eq("provider", provider);
    if (error) throw error;
}

/** Decrypt the stored access token, refreshing it first when expired. */
async function freshAccessToken(
    db: Db,
    userId: string,
    provider: CloudProvider,
): Promise<string> {
    const account = await getAccount(db, userId, provider);
    if (!account?.encrypted_access_token) {
        throw new CloudImportError(
            `Connect your ${providerLabel(provider)} account first.`,
            401,
        );
    }
    const expiresAt = account.access_token_expires_at
        ? Date.parse(account.access_token_expires_at)
        : 0;
    const stillValid = expiresAt > Date.now() + 60_000;
    const accessToken = decryptString(
        account.encrypted_access_token,
        account.access_token_iv,
        account.access_token_tag,
    );
    if (stillValid && accessToken) return accessToken;

    const refreshToken = decryptString(
        account.encrypted_refresh_token,
        account.refresh_token_iv,
        account.refresh_token_tag,
    );
    if (!refreshToken) {
        if (accessToken) return accessToken; // no expiry info — try it
        throw new CloudImportError(
            `Your ${providerLabel(provider)} session expired — reconnect the account.`,
            401,
        );
    }
    const tokens = await requestTokens(provider, {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        ...(provider === "onedrive"
            ? { scope: "Files.Read User.Read offline_access" }
            : {}),
    });
    const access = encryptString(tokens.access_token);
    await db
        .from("gavel_cloud_import_accounts")
        .update({
            encrypted_access_token: access.encrypted,
            access_token_iv: access.iv,
            access_token_tag: access.tag,
            access_token_expires_at: expiryFromNow(tokens.expires_in),
            updated_at: new Date().toISOString(),
        })
        .eq("id", account.id);
    return tokens.access_token;
}

// ---------- File listing and download ----------

export interface CloudFile {
    id: string;
    name: string;
    /** Filename the import will create (adds an extension for exports). */
    importName: string;
    sizeBytes: number | null;
    modifiedAt: string | null;
    /** Set for Google-native files that import via export. */
    exportedAs: "docx" | "xlsx" | "pptx" | null;
}

const GOOGLE_EXPORTS: Record<
    string,
    { extension: "docx" | "xlsx" | "pptx"; mimeType: string }
> = {
    "application/vnd.google-apps.document": {
        extension: "docx",
        mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    "application/vnd.google-apps.spreadsheet": {
        extension: "xlsx",
        mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    "application/vnd.google-apps.presentation": {
        extension: "pptx",
        mimeType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    },
};

export function fileExtension(name: string): string {
    return name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
}

/**
 * Decide whether (and as what) a cloud file can be imported: directly by
 * allowed extension, or via export for Google-native types. Returns null
 * for everything else (folders, images, unknown types).
 */
export function importTarget(
    name: string,
    mimeType: string | null,
): { importName: string; exportedAs: CloudFile["exportedAs"] } | null {
    const gexport = mimeType ? GOOGLE_EXPORTS[mimeType] : undefined;
    if (gexport) {
        return {
            importName: `${name}.${gexport.extension}`,
            exportedAs: gexport.extension,
        };
    }
    if (ALLOWED_DOCUMENT_TYPES.has(fileExtension(name))) {
        return { importName: name, exportedAs: null };
    }
    return null;
}

async function providerFetch(
    url: string,
    accessToken: string,
    provider: CloudProvider,
): Promise<Response> {
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
        throw new CloudImportError(
            `Your ${providerLabel(provider)} session expired — reconnect the account.`,
            401,
        );
    }
    return response;
}

export async function listFiles(
    db: Db,
    userId: string,
    provider: CloudProvider,
    query: string,
): Promise<CloudFile[]> {
    const accessToken = await freshAccessToken(db, userId, provider);
    if (provider === "google_drive") {
        const importableMimes = [
            ...Object.keys(GOOGLE_EXPORTS),
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/vnd.ms-powerpoint",
        ];
        const qParts = [
            "trashed = false",
            `(${importableMimes.map((m) => `mimeType = '${m}'`).join(" or ")})`,
        ];
        const term = query.trim().replace(/['\\]/g, "\\$&");
        if (term) qParts.push(`name contains '${term}'`);
        const params = new URLSearchParams({
            q: qParts.join(" and "),
            fields: "files(id, name, mimeType, size, modifiedTime)",
            pageSize: "50",
            orderBy: "modifiedTime desc",
        });
        const response = await providerFetch(
            `https://www.googleapis.com/drive/v3/files?${params}`,
            accessToken,
            provider,
        );
        if (!response.ok) {
            throw new CloudImportError(
                `Google Drive listing failed (${response.status}).`,
                502,
            );
        }
        const payload = (await response.json()) as {
            files?: {
                id: string;
                name: string;
                mimeType?: string;
                size?: string;
                modifiedTime?: string;
            }[];
        };
        const files: CloudFile[] = [];
        for (const f of payload.files ?? []) {
            const target = importTarget(f.name, f.mimeType ?? null);
            if (!target) continue;
            files.push({
                id: f.id,
                name: f.name,
                importName: target.importName,
                sizeBytes: f.size ? Number.parseInt(f.size, 10) : null,
                modifiedAt: f.modifiedTime ?? null,
                exportedAs: target.exportedAs,
            });
        }
        return files;
    }

    const term = query.trim();
    const url = term
        ? `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(term.replace(/'/g, "''"))}')?$top=50&$select=id,name,size,file,lastModifiedDateTime`
        : "https://graph.microsoft.com/v1.0/me/drive/recent?$top=50&$select=id,name,size,file,lastModifiedDateTime,remoteItem";
    const response = await providerFetch(url, accessToken, provider);
    if (!response.ok) {
        throw new CloudImportError(
            `OneDrive listing failed (${response.status}).`,
            502,
        );
    }
    const payload = (await response.json()) as {
        value?: {
            id: string;
            name: string;
            size?: number;
            lastModifiedDateTime?: string;
            file?: unknown;
            remoteItem?: unknown;
        }[];
    };
    const files: CloudFile[] = [];
    for (const item of payload.value ?? []) {
        if (!item.file && !item.remoteItem) continue; // skip folders
        const target = importTarget(item.name, null);
        if (!target) continue;
        files.push({
            id: item.id,
            name: item.name,
            importName: target.importName,
            sizeBytes: item.size ?? null,
            modifiedAt: item.lastModifiedDateTime ?? null,
            exportedAs: null,
        });
    }
    return files;
}

export async function downloadCloudFile(
    db: Db,
    userId: string,
    provider: CloudProvider,
    fileId: string,
): Promise<{ filename: string; content: Buffer }> {
    const accessToken = await freshAccessToken(db, userId, provider);
    if (!/^[\w!.~*'()-]+$/i.test(fileId)) {
        throw new CloudImportError("Invalid file id.");
    }

    if (provider === "google_drive") {
        const metaResponse = await providerFetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size`,
            accessToken,
            provider,
        );
        if (!metaResponse.ok) {
            throw new CloudImportError(
                `Google Drive file lookup failed (${metaResponse.status}).`,
                502,
            );
        }
        const meta = (await metaResponse.json()) as {
            name: string;
            mimeType?: string;
            size?: string;
        };
        const target = importTarget(meta.name, meta.mimeType ?? null);
        if (!target) {
            throw new CloudImportError(
                `"${meta.name}" is not an importable file type.`,
            );
        }
        const gexport = meta.mimeType
            ? GOOGLE_EXPORTS[meta.mimeType]
            : undefined;
        const downloadUrl = gexport
            ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(gexport.mimeType)}`
            : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
        const response = await providerFetch(
            downloadUrl,
            accessToken,
            provider,
        );
        if (!response.ok) {
            throw new CloudImportError(
                `Google Drive download failed (${response.status}).`,
                502,
            );
        }
        const content = await readWithCap(response, meta.name);
        return { filename: target.importName, content };
    }

    const metaResponse = await providerFetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}?$select=id,name,size`,
        accessToken,
        provider,
    );
    if (!metaResponse.ok) {
        throw new CloudImportError(
            `OneDrive file lookup failed (${metaResponse.status}).`,
            502,
        );
    }
    const meta = (await metaResponse.json()) as { name: string };
    const target = importTarget(meta.name, null);
    if (!target) {
        throw new CloudImportError(
            `"${meta.name}" is not an importable file type.`,
        );
    }
    const response = await providerFetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`,
        accessToken,
        provider,
    );
    if (!response.ok) {
        throw new CloudImportError(
            `OneDrive download failed (${response.status}).`,
            502,
        );
    }
    const content = await readWithCap(response, meta.name);
    return { filename: target.importName, content };
}

/** Read a response body, aborting past the platform upload cap. */
export async function readWithCap(
    response: Response,
    label: string,
): Promise<Buffer> {
    const declared = Number.parseInt(
        response.headers.get("content-length") ?? "",
        10,
    );
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_SIZE_BYTES) {
        throw new CloudImportError(
            `"${label}" is larger than the ${MAX_UPLOAD_SIZE_MB} MB import limit.`,
            413,
        );
    }
    if (!response.body) {
        const buf = Buffer.from(await response.arrayBuffer());
        if (buf.byteLength > MAX_UPLOAD_SIZE_BYTES) {
            throw new CloudImportError(
                `"${label}" is larger than the ${MAX_UPLOAD_SIZE_MB} MB import limit.`,
                413,
            );
        }
        return buf;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            total += value.byteLength;
            if (total > MAX_UPLOAD_SIZE_BYTES) {
                await reader.cancel();
                throw new CloudImportError(
                    `"${label}" is larger than the ${MAX_UPLOAD_SIZE_MB} MB import limit.`,
                    413,
                );
            }
            chunks.push(value);
        }
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}
