import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { chatRouter } from "./routes/chat";
import { projectsRouter } from "./routes/projects";
import { projectChatRouter } from "./routes/projectChat";
import { documentsRouter } from "./routes/documents";
import { tabularRouter } from "./routes/tabular";
import { workflowsRouter } from "./routes/workflows";
import { userRouter } from "./routes/user";
import { downloadsRouter } from "./routes/downloads";
import { caseLawRouter } from "./routes/caseLaw";
import { organizationsRouter } from "./routes/organizations";
import { clausesRouter } from "./routes/clauses";
import { conflictsRouter } from "./routes/conflicts";
import { adminRouter } from "./routes/admin";
import { cloudImportRouter } from "./routes/cloudImport";
import { audited } from "./lib/auditLog";
import { allowedFrontendOrigins } from "./lib/frontendUrls";
import {
  errorMonitor,
  initErrorReporting,
  serverErrorObserver,
  tracked,
} from "./lib/usageMetrics";

const app = express();
const PORT = process.env.PORT ?? 3001;
const isProduction = process.env.NODE_ENV === "production";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function minutes(value: number): number {
  return value * 60 * 1000;
}

function hours(value: number): number {
  return minutes(value * 60);
}

function makeLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS",
    message: {
      detail:
        options.message ?? "Too many requests. Please try again later.",
    },
  });
}

const generalLimiter = makeLimiter({
  windowMs: minutes(envInt("RATE_LIMIT_GENERAL_WINDOW_MINUTES", 15)),
  max: envInt("RATE_LIMIT_GENERAL_MAX", 300),
});

const chatLimiter = makeLimiter({
  windowMs: minutes(envInt("RATE_LIMIT_CHAT_WINDOW_MINUTES", 15)),
  max: envInt("RATE_LIMIT_CHAT_MAX", 30),
  message: "Too many chat requests. Please try again later.",
});

const chatCreateLimiter = makeLimiter({
  windowMs: minutes(envInt("RATE_LIMIT_CHAT_CREATE_WINDOW_MINUTES", 15)),
  max: envInt("RATE_LIMIT_CHAT_CREATE_MAX", 60),
});

const uploadLimiter = makeLimiter({
  windowMs: hours(envInt("RATE_LIMIT_UPLOAD_WINDOW_HOURS", 1)),
  max: envInt("RATE_LIMIT_UPLOAD_MAX", 50),
  message: "Too many upload requests. Please try again later.",
});

const exportLimiter = makeLimiter({
  windowMs: hours(envInt("RATE_LIMIT_EXPORT_WINDOW_HOURS", 1)),
  max: envInt("RATE_LIMIT_EXPORT_MAX", 10),
  message: "Too many export requests. Please try again later.",
});

const dataDeleteLimiter = makeLimiter({
  windowMs: hours(envInt("RATE_LIMIT_DATA_DELETE_WINDOW_HOURS", 1)),
  max: envInt("RATE_LIMIT_DATA_DELETE_MAX", 20),
  message: "Too many data deletion requests. Please try again later.",
});

function jsonLimitForPath(path: string): string {
  return "50mb";
}

app.disable("x-powered-by");
app.set("trust proxy", envInt("TRUST_PROXY_HOPS", 1));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: isProduction
      ? {
          maxAge: 15552000,
          includeSubDomains: true,
        }
      : false,
    referrerPolicy: { policy: "no-referrer" },
  }),
);

app.use(
  cors({
    origin: allowedFrontendOrigins(),
    credentials: true,
  }),
);

app.use(generalLimiter);
app.use(serverErrorObserver);

app.post("/chat", chatLimiter);
app.post("/projects/:projectId/chat", chatLimiter);
app.post("/tabular-review/:reviewId/chat", chatLimiter);
app.post("/tabular-review/:reviewId/generate", chatLimiter);
app.post("/chat/create", chatCreateLimiter);
app.post("/chat/:chatId/generate-title", chatCreateLimiter);
app.post("/single-documents", uploadLimiter);
app.post("/single-documents/:documentId/versions", uploadLimiter);
app.put(
  "/single-documents/:documentId/versions/:versionId/file",
  uploadLimiter,
);
app.post("/projects/:projectId/documents", uploadLimiter);
app.post("/cloud-import/:provider/import", uploadLimiter);
app.post("/cloud-import/url", uploadLimiter);
app.get("/user/export", exportLimiter);
app.get("/user/chats/export", exportLimiter);
app.get("/user/tabular-reviews/export", exportLimiter);
app.delete("/user/account", dataDeleteLimiter);
app.delete("/user/chats", dataDeleteLimiter);
app.delete("/user/projects", dataDeleteLimiter);
app.delete("/user/tabular-reviews", dataDeleteLimiter);

// Audit trail: same one-place declaration style as the rate limiters
// above. Entries are written fire-and-forget on successful responses.
const docResource = (req: express.Request) => ({
  type: "document",
  id: req.params.documentId,
});
app.post("/single-documents", audited("document.upload"));
app.post(
  "/single-documents/:documentId/versions",
  audited("document.version_upload", docResource),
);
app.put(
  "/single-documents/:documentId/versions/:versionId/file",
  audited("document.version_upload", docResource),
);
app.post(
  "/projects/:projectId/documents",
  audited("document.upload", (req) => ({
    type: "project",
    id: req.params.projectId,
  })),
);
app.delete(
  "/single-documents/:documentId",
  audited("document.delete", docResource),
);
app.get(
  "/single-documents/:documentId/url",
  audited("document.download", docResource),
);
app.post("/single-documents/download-zip", audited("document.download"));
app.post("/cloud-import/:provider/import", audited("document.upload"));
app.post("/cloud-import/url", audited("document.upload"));
app.post("/chat/create", audited("chat.create"));
app.delete(
  "/chat/:chatId",
  audited("chat.delete", (req) => ({ type: "chat", id: req.params.chatId })),
);
const reviewResource = (req: express.Request) => ({
  type: "tabular_review",
  id: req.params.reviewId,
});
app.post("/tabular-review", audited("tabular.create"));
app.post(
  "/tabular-review/:reviewId/generate",
  audited("tabular.generate", reviewResource),
);
app.delete(
  "/tabular-review/:reviewId",
  audited("tabular.delete", reviewResource),
);
app.get("/user/export", audited("data.export"));
app.get("/user/chats/export", audited("data.export"));
app.get("/user/tabular-reviews/export", audited("data.export"));
app.delete("/user/account", audited("account.delete"));
app.delete("/user/chats", audited("data.delete"));
app.delete("/user/projects", audited("data.delete"));
app.delete("/user/tabular-reviews", audited("data.delete"));
app.put(
  "/user/api-keys/:provider",
  audited("api_key.save", (req) => ({
    type: "api_key",
    id: req.params.provider,
  })),
);

// Operator usage metrics: adoption events on the actions that indicate a
// live, healthy account. Same one-place declaration style as the audit
// trail; 5xx capture is global via serverErrorObserver above.
app.get("/user/profile", tracked("app.open"));
app.post("/chat", tracked("chat.message"));
app.post("/projects/:projectId/chat", tracked("chat.message"));
app.post("/tabular-review/:reviewId/chat", tracked("chat.message"));
app.post("/chat/create", tracked("chat.create"));
app.post("/single-documents", tracked("document.upload"));
app.post("/projects/:projectId/documents", tracked("document.upload"));
app.post("/tabular-review/:reviewId/generate", tracked("tabular.generate"));
app.post("/projects", tracked("project.create"));
app.post("/workflows", tracked("workflow.create"));
app.post("/conflicts/check", tracked("conflict.check"));

app.use((req, res, next) =>
  express.json({ limit: jsonLimitForPath(req.path) })(req, res, next),
);

app.use("/chat", chatRouter);
app.use("/projects", projectsRouter);
app.use("/projects/:projectId/chat", projectChatRouter);
app.use("/single-documents", documentsRouter);
app.use("/tabular-review", tabularRouter);
app.use("/workflows", workflowsRouter);
app.use("/user", userRouter);
app.use("/users", userRouter);
app.use("/download", downloadsRouter);
app.use("/case-law", caseLawRouter);
app.use("/organizations", organizationsRouter);
app.use("/clauses", clausesRouter);
app.use("/conflicts", conflictsRouter);
app.use("/admin", adminRouter);
app.use("/cloud-import", cloudImportRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(errorMonitor);

void initErrorReporting();
app.listen(PORT, () => {
  console.log(`Gavel backend running on port ${PORT}`);
});
