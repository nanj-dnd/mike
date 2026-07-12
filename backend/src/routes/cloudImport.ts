import crypto from "crypto";
import { Router } from "express";
import { requireAuth, requireMfaIfEnrolled } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { checkProjectAccess } from "../lib/access";
import { validatePublicHttpsUrl } from "../lib/mcp/client";
import {
    createDocumentFromBuffer,
    DocumentCreateError,
} from "../lib/documentCreate";
import {
    authorizationUrl,
    CloudImportError,
    completeOAuth,
    disconnectAccount,
    downloadCloudFile,
    fileExtension,
    isCloudProvider,
    listAccounts,
    listFiles,
    providerLabel,
    readWithCap,
    signOAuthState,
    verifyOAuthState,
    type CloudProvider,
} from "../lib/cloudImport";
import { ALLOWED_DOCUMENT_TYPES } from "../lib/documentTypes";
import { recordUsage } from "../lib/usageMetrics";

export const cloudImportRouter = Router();

const MAX_FILES_PER_IMPORT = 10;
const MAX_URL_REDIRECTS = 3;

function frontendOrigin(): string {
    return new URL(
        process.env.FRONTEND_URL ?? "http://localhost:3000",
    ).origin;
}

function popupCsp(nonce: string) {
    return [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        "style-src 'unsafe-inline'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
    ].join("; ");
}

function popupHtml(
    payload: { success: boolean; provider?: string; detail?: string },
    nonce: string,
) {
    const message = JSON.stringify({
        type: "cloud_import_oauth_result",
        ...payload,
    });
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cloud import authorization</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; background: #f9fafb; }
      main { max-width: 360px; padding: 24px; text-align: center; }
      p { color: #6b7280; }
    </style>
  </head>
  <body>
    <main>
      <h1>${payload.success ? "Account connected" : "Connection failed"}</h1>
      <p>${payload.success ? "You can return to Gavel." : "Return to Gavel and try connecting again."}</p>
    </main>
    <script nonce="${nonce}">
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(${message}, ${JSON.stringify(frontendOrigin())});
      }
      setTimeout(() => window.close(), ${payload.success ? 600 : 2500});
    </script>
  </body>
</html>`;
}

function providerParam(raw: string): CloudProvider {
    if (!isCloudProvider(raw)) {
        throw new CloudImportError("Unknown provider.", 404);
    }
    return raw;
}

async function resolveProjectId(
    req: import("express").Request,
    res: import("express").Response,
): Promise<{ ok: true; projectId: string | null } | { ok: false }> {
    const projectId =
        typeof req.body?.projectId === "string" && req.body.projectId
            ? (req.body.projectId as string)
            : null;
    if (!projectId) return { ok: true, projectId: null };
    const db = createServerSupabase();
    const access = await checkProjectAccess(
        projectId,
        res.locals.userId as string,
        res.locals.userEmail as string | undefined,
        db,
    );
    if (!access.ok) {
        res.status(404).json({ detail: "Project not found" });
        return { ok: false };
    }
    return { ok: true, projectId };
}

function sendCloudError(res: import("express").Response, err: unknown) {
    if (err instanceof CloudImportError || err instanceof DocumentCreateError) {
        return void res.status(err.status).json({ detail: err.message });
    }
    console.error("[cloud-import] request failed", err);
    res.status(500).json({ detail: "Cloud import failed" });
}

// GET /cloud-import — provider configuration/connection status.
cloudImportRouter.get("/", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    try {
        res.json({ providers: await listAccounts(db, userId) });
    } catch (err) {
        sendCloudError(res, err);
    }
});

// GET /cloud-import/oauth/callback — OAuth redirect target (popup).
cloudImportRouter.get("/oauth/callback", async (req, res) => {
    const nonce = crypto.randomBytes(16).toString("base64");
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const oauthError =
        typeof req.query.error === "string" ? req.query.error : undefined;
    try {
        if (oauthError) throw new CloudImportError(oauthError);
        if (!state || !code) {
            throw new CloudImportError(
                "OAuth callback is missing state or code.",
            );
        }
        const verified = verifyOAuthState(state);
        const db = createServerSupabase();
        await completeOAuth(db, verified, code);
        res.set("Content-Security-Policy", popupCsp(nonce))
            .type("html")
            .send(
                popupHtml(
                    { success: true, provider: verified.provider },
                    nonce,
                ),
            );
    } catch (err) {
        const detail =
            err instanceof Error ? err.message : "Authorization failed.";
        console.error("[cloud-import] oauth callback failed", detail);
        res.status(400)
            .set("Content-Security-Policy", popupCsp(nonce))
            .type("html")
            .send(popupHtml({ success: false, detail }, nonce));
    }
});

// POST /cloud-import/url — import a document from a public HTTPS URL.
cloudImportRouter.post("/url", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    try {
        const rawUrl =
            typeof req.body?.url === "string" ? req.body.url.trim() : "";
        if (!rawUrl) {
            return void res.status(400).json({ detail: "url is required" });
        }
        const project = await resolveProjectId(req, res);
        if (!project.ok) return;

        // Follow redirects manually so every hop is SSRF-checked.
        let currentUrl = await validatePublicHttpsUrl(rawUrl, "Import URL");
        let response: Response | null = null;
        for (let hop = 0; hop <= MAX_URL_REDIRECTS; hop++) {
            response = await fetch(currentUrl, { redirect: "manual" });
            const location = response.headers.get("location");
            if (
                response.status >= 300 &&
                response.status < 400 &&
                location
            ) {
                currentUrl = await validatePublicHttpsUrl(
                    new URL(location, currentUrl).toString(),
                    "Import URL",
                );
                continue;
            }
            break;
        }
        if (!response || !response.ok) {
            return void res.status(400).json({
                detail: `Could not fetch the URL (status ${response?.status ?? "unknown"}).`,
            });
        }

        const overrideName =
            typeof req.body?.filename === "string"
                ? req.body.filename.trim()
                : "";
        const disposition = response.headers.get("content-disposition") ?? "";
        const dispositionName = disposition.match(
            /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i,
        )?.[1];
        const pathName = decodeURIComponent(
            new URL(currentUrl).pathname.split("/").pop() ?? "",
        );
        const filename = (overrideName || dispositionName || pathName).trim();
        if (!filename || !ALLOWED_DOCUMENT_TYPES.has(fileExtension(filename))) {
            return void res.status(400).json({
                detail:
                    "Could not determine an importable filename — pass a `filename` ending in a supported extension (pdf, docx, xlsx, pptx, …).",
            });
        }

        const content = await readWithCap(response, filename);
        const db = createServerSupabase();
        const doc = await createDocumentFromBuffer(db, {
            userId,
            projectId: project.projectId,
            filename,
            content,
        });
        recordUsage({
            userId,
            event: "document.import",
            route: "POST /cloud-import/url",
            metadata: { source: "url" },
        });
        res.status(201).json({ documents: [doc] });
    } catch (err) {
        sendCloudError(res, err);
    }
});

// POST /cloud-import/:provider/oauth/start — begin account connection.
cloudImportRouter.post(
    "/:provider/oauth/start",
    requireAuth,
    requireMfaIfEnrolled,
    async (req, res) => {
        try {
            const provider = providerParam(req.params.provider);
            const userId = res.locals.userId as string;
            const state = signOAuthState({ userId, provider });
            res.json({ authorizeUrl: authorizationUrl(provider, state) });
        } catch (err) {
            sendCloudError(res, err);
        }
    },
);

// DELETE /cloud-import/:provider — disconnect the account.
cloudImportRouter.delete(
    "/:provider",
    requireAuth,
    requireMfaIfEnrolled,
    async (req, res) => {
        try {
            const provider = providerParam(req.params.provider);
            const db = createServerSupabase();
            await disconnectAccount(
                db,
                res.locals.userId as string,
                provider,
            );
            res.json({ ok: true });
        } catch (err) {
            sendCloudError(res, err);
        }
    },
);

// GET /cloud-import/:provider/files?q= — search importable files.
cloudImportRouter.get("/:provider/files", requireAuth, async (req, res) => {
    try {
        const provider = providerParam(req.params.provider);
        const query = typeof req.query.q === "string" ? req.query.q : "";
        const db = createServerSupabase();
        const files = await listFiles(
            db,
            res.locals.userId as string,
            provider,
            query,
        );
        res.json({ files });
    } catch (err) {
        sendCloudError(res, err);
    }
});

// POST /cloud-import/:provider/import — fetch files server-side and run
// them through the normal document pipeline.
cloudImportRouter.post("/:provider/import", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    try {
        const provider = providerParam(req.params.provider);
        const fileIds = Array.isArray(req.body?.fileIds)
            ? (req.body.fileIds as unknown[]).filter(
                  (id): id is string => typeof id === "string" && !!id,
              )
            : [];
        if (fileIds.length === 0) {
            return void res
                .status(400)
                .json({ detail: "fileIds must be a non-empty array" });
        }
        if (fileIds.length > MAX_FILES_PER_IMPORT) {
            return void res.status(400).json({
                detail: `Import up to ${MAX_FILES_PER_IMPORT} files at a time`,
            });
        }
        const project = await resolveProjectId(req, res);
        if (!project.ok) return;

        const db = createServerSupabase();
        const documents: Record<string, unknown>[] = [];
        const failures: { fileId: string; detail: string }[] = [];
        for (const fileId of fileIds) {
            try {
                const { filename, content } = await downloadCloudFile(
                    db,
                    userId,
                    provider,
                    fileId,
                );
                documents.push(
                    await createDocumentFromBuffer(db, {
                        userId,
                        projectId: project.projectId,
                        filename,
                        content,
                    }),
                );
            } catch (err) {
                failures.push({
                    fileId,
                    detail:
                        err instanceof Error
                            ? err.message
                            : `${providerLabel(provider)} import failed`,
                });
            }
        }
        if (documents.length === 0) {
            return void res.status(400).json({
                detail:
                    failures[0]?.detail ??
                    `${providerLabel(provider)} import failed`,
                failures,
            });
        }
        recordUsage({
            userId,
            event: "document.import",
            route: "POST /cloud-import/:provider/import",
            metadata: { source: provider, count: documents.length },
        });
        res.status(201).json({ documents, failures });
    } catch (err) {
        sendCloudError(res, err);
    }
});
