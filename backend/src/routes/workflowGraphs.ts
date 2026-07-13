import { Router } from "express";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { logAudit } from "../lib/auditLog";
import {
    buildEngineDepsForUser,
    cancelRun,
    createRun,
    hashWebhookSecret,
    nextCronRun,
    parseCronExpression,
    resumeHumanNode,
    startRun,
    validateWorkflowDefinition,
    webhookSecretMatches,
    SupabaseEnginePersistence,
} from "../lib/workflowEngine";

export const workflowGraphsRouter = Router();
export const workflowRunsRouter = Router();
export const workflowHooksRouter = Router();

function isMissingTable(error: unknown): boolean {
    const message =
        error && typeof error === "object" && "message" in error
            ? String((error as { message: unknown }).message)
            : String(error ?? "");
    const code =
        error && typeof error === "object" && "code" in error
            ? String((error as { code: unknown }).code)
            : "";
    return code === "42P01" || /could not find the table|schema cache/i.test(message);
}

const NOT_SET_UP =
    "The workflow engine is not set up on this deployment yet. Apply migration 20260713_01_gavel_workflow_engine.sql.";

function cleanText(value: unknown, max: number): string {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const GRAPH_COLUMNS =
    "id, name, description, template_workflow_id, latest_version, created_at, updated_at";

// ---------------------------------------------------------------------------
// Graph CRUD
// ---------------------------------------------------------------------------

workflowGraphsRouter.get("/", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    try {
        const { data, error } = await db
            .from("gavel_workflow_graphs")
            .select(GRAPH_COLUMNS)
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
        if (error) throw error;
        res.json({ graphs: data ?? [] });
    } catch (error) {
        if (isMissingTable(error)) return void res.json({ graphs: [] });
        console.error("[workflow-graphs] list failed", error);
        res.status(500).json({ detail: "Failed to list workflow graphs" });
    }
});

workflowGraphsRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const name = cleanText(req.body?.name, 200);
    const description = cleanText(req.body?.description, 2000);
    const definition = req.body?.definition;
    if (!name) return void res.status(400).json({ detail: "name is required" });
    const check = validateWorkflowDefinition(definition);
    if (!check.ok) {
        return void res
            .status(400)
            .json({ detail: "Invalid workflow definition", errors: check.errors });
    }
    const db = createServerSupabase();
    try {
        const { data: graph, error } = await db
            .from("gavel_workflow_graphs")
            .insert({ user_id: userId, name, description: description || null })
            .select(GRAPH_COLUMNS)
            .single();
        if (error) throw error;
        const { error: versionError } = await db
            .from("gavel_workflow_graph_versions")
            .insert({ graph_id: graph.id, version: 1, definition });
        if (versionError) throw versionError;
        logAudit({
            userId,
            action: "workflow_graph.create",
            resourceType: "workflow_graph",
            resourceId: graph.id,
            req,
        });
        res.status(201).json({ ...graph, definition });
    } catch (error) {
        if (isMissingTable(error)) return void res.status(503).json({ detail: NOT_SET_UP });
        console.error("[workflow-graphs] create failed", error);
        res.status(500).json({ detail: "Failed to create workflow graph" });
    }
});

workflowGraphsRouter.get("/:graphId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    try {
        const { data: graph, error } = await db
            .from("gavel_workflow_graphs")
            .select(GRAPH_COLUMNS)
            .eq("id", req.params.graphId)
            .eq("user_id", userId)
            .maybeSingle();
        if (error) throw error;
        if (!graph) return void res.status(404).json({ detail: "Workflow graph not found" });
        const { data: version, error: versionError } = await db
            .from("gavel_workflow_graph_versions")
            .select("version, definition, created_at")
            .eq("graph_id", graph.id)
            .eq("version", graph.latest_version)
            .maybeSingle();
        if (versionError) throw versionError;
        res.json({ ...graph, definition: version?.definition ?? null });
    } catch (error) {
        if (isMissingTable(error)) return void res.status(503).json({ detail: NOT_SET_UP });
        console.error("[workflow-graphs] get failed", error);
        res.status(500).json({ detail: "Failed to load workflow graph" });
    }
});

workflowGraphsRouter.patch("/:graphId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    try {
        const { data: graph, error } = await db
            .from("gavel_workflow_graphs")
            .select("id, latest_version")
            .eq("id", req.params.graphId)
            .eq("user_id", userId)
            .maybeSingle();
        if (error) throw error;
        if (!graph) return void res.status(404).json({ detail: "Workflow graph not found" });

        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (req.body?.name !== undefined) {
            const name = cleanText(req.body.name, 200);
            if (!name) return void res.status(400).json({ detail: "name must not be empty" });
            patch.name = name;
        }
        if (req.body?.description !== undefined) {
            patch.description = cleanText(req.body.description, 2000) || null;
        }

        let newVersion: number | null = null;
        if (req.body?.definition !== undefined) {
            const check = validateWorkflowDefinition(req.body.definition);
            if (!check.ok) {
                return void res
                    .status(400)
                    .json({ detail: "Invalid workflow definition", errors: check.errors });
            }
            newVersion = graph.latest_version + 1;
            const { error: versionError } = await db
                .from("gavel_workflow_graph_versions")
                .insert({
                    graph_id: graph.id,
                    version: newVersion,
                    definition: req.body.definition,
                });
            if (versionError) throw versionError;
            patch.latest_version = newVersion;
        }

        const { data: updated, error: updateError } = await db
            .from("gavel_workflow_graphs")
            .update(patch)
            .eq("id", graph.id)
            .select(GRAPH_COLUMNS)
            .single();
        if (updateError) throw updateError;
        logAudit({
            userId,
            action: "workflow_graph.update",
            resourceType: "workflow_graph",
            resourceId: graph.id,
            metadata: newVersion ? { new_version: newVersion } : undefined,
            req,
        });
        res.json(updated);
    } catch (error) {
        if (isMissingTable(error)) return void res.status(503).json({ detail: NOT_SET_UP });
        console.error("[workflow-graphs] update failed", error);
        res.status(500).json({ detail: "Failed to update workflow graph" });
    }
});

workflowGraphsRouter.delete("/:graphId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    try {
        const { error } = await db
            .from("gavel_workflow_graphs")
            .delete()
            .eq("id", req.params.graphId)
            .eq("user_id", userId);
        if (error) throw error;
        logAudit({
            userId,
            action: "workflow_graph.delete",
            resourceType: "workflow_graph",
            resourceId: req.params.graphId,
            req,
        });
        res.json({ ok: true });
    } catch (error) {
        if (isMissingTable(error)) return void res.status(503).json({ detail: NOT_SET_UP });
        console.error("[workflow-graphs] delete failed", error);
        res.status(500).json({ detail: "Failed to delete workflow graph" });
    }
});

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

workflowGraphsRouter.post("/:graphId/runs", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const input =
        req.body?.input && typeof req.body.input === "object" && !Array.isArray(req.body.input)
            ? (req.body.input as Record<string, unknown>)
            : {};
    const db = createServerSupabase();
    try {
        const { data: graph, error } = await db
            .from("gavel_workflow_graphs")
            .select("id")
            .eq("id", req.params.graphId)
            .eq("user_id", userId)
            .maybeSingle();
        if (error) throw error;
        if (!graph) return void res.status(404).json({ detail: "Workflow graph not found" });

        const runId = await createRun(db, {
            graphId: graph.id,
            userId,
            input,
            triggerSource: "manual",
        });
        if (!runId) return void res.status(404).json({ detail: "Workflow graph not found" });
        const deps = await buildEngineDepsForUser(userId, db);
        await startRun(runId, deps);
        logAudit({
            userId,
            action: "workflow_run.start",
            resourceType: "workflow_run",
            resourceId: runId,
            req,
        });
        res.status(201).json({ run_id: runId, status: "running" });
    } catch (error) {
        if (isMissingTable(error)) return void res.status(503).json({ detail: NOT_SET_UP });
        console.error("[workflow-graphs] start run failed", error);
        res.status(500).json({ detail: "Failed to start workflow run" });
    }
});

workflowGraphsRouter.get("/:graphId/runs", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    try {
        const { data, error } = await db
            .from("gavel_workflow_runs")
            .select(
                "id, graph_id, status, trigger_source, error, created_at, started_at, finished_at",
            )
            .eq("graph_id", req.params.graphId)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(100);
        if (error) throw error;
        res.json({ runs: data ?? [] });
    } catch (error) {
        if (isMissingTable(error)) return void res.json({ runs: [] });
        console.error("[workflow-graphs] list runs failed", error);
        res.status(500).json({ detail: "Failed to list runs" });
    }
});

workflowRunsRouter.get("/", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    try {
        const { data, error } = await db
            .from("gavel_workflow_runs")
            .select(
                "id, graph_id, status, trigger_source, error, created_at, started_at, finished_at",
            )
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(100);
        if (error) throw error;
        res.json({ runs: data ?? [] });
    } catch (error) {
        if (isMissingTable(error)) return void res.json({ runs: [] });
        console.error("[workflow-runs] list failed", error);
        res.status(500).json({ detail: "Failed to list runs" });
    }
});

workflowRunsRouter.get("/:runId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    try {
        const { data: run, error } = await db
            .from("gavel_workflow_runs")
            .select("*")
            .eq("id", req.params.runId)
            .eq("user_id", userId)
            .maybeSingle();
        if (error) throw error;
        if (!run) return void res.status(404).json({ detail: "Run not found" });
        const [{ data: nodeRuns, error: nodesError }, { data: events, error: eventsError }] =
            await Promise.all([
                db
                    .from("gavel_workflow_node_runs")
                    .select(
                        "node_id, iteration_key, attempt, status, input, output, error, model, prompt_tokens, completion_tokens, started_at, finished_at",
                    )
                    .eq("run_id", run.id)
                    .order("created_at", { ascending: true }),
                db
                    .from("gavel_workflow_run_events")
                    .select("node_id, level, message, data, created_at")
                    .eq("run_id", run.id)
                    .order("id", { ascending: true })
                    .limit(500),
            ]);
        if (nodesError) throw nodesError;
        if (eventsError) throw eventsError;
        res.json({ run, node_runs: nodeRuns ?? [], events: events ?? [] });
    } catch (error) {
        if (isMissingTable(error)) return void res.status(503).json({ detail: NOT_SET_UP });
        console.error("[workflow-runs] get failed", error);
        res.status(500).json({ detail: "Failed to load run" });
    }
});

workflowRunsRouter.post("/:runId/cancel", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    try {
        const persistence = new SupabaseEnginePersistence(db);
        const run = await persistence.getRun(req.params.runId);
        if (!run || run.user_id !== userId) {
            return void res.status(404).json({ detail: "Run not found" });
        }
        const result = await cancelRun(run.id, persistence);
        if (!result.ok) return void res.status(409).json({ detail: result.detail });
        logAudit({
            userId,
            action: "workflow_run.cancel",
            resourceType: "workflow_run",
            resourceId: run.id,
            req,
        });
        res.json({ ok: true });
    } catch (error) {
        if (isMissingTable(error)) return void res.status(503).json({ detail: NOT_SET_UP });
        console.error("[workflow-runs] cancel failed", error);
        res.status(500).json({ detail: "Failed to cancel run" });
    }
});

workflowRunsRouter.post("/:runId/resume", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const nodeId = cleanText(req.body?.node_id, 300);
    if (!nodeId) return void res.status(400).json({ detail: "node_id is required" });
    const db = createServerSupabase();
    try {
        const persistence = new SupabaseEnginePersistence(db);
        const run = await persistence.getRun(req.params.runId);
        if (!run || run.user_id !== userId) {
            return void res.status(404).json({ detail: "Run not found" });
        }
        const deps = await buildEngineDepsForUser(userId, db);
        const result = await resumeHumanNode(run.id, nodeId, req.body?.response, deps);
        if (!result.ok) return void res.status(409).json({ detail: result.detail });
        logAudit({
            userId,
            action: "workflow_run.resume",
            resourceType: "workflow_run",
            resourceId: run.id,
            metadata: { node_id: nodeId },
            req,
        });
        res.json({ ok: true });
    } catch (error) {
        if (isMissingTable(error)) return void res.status(503).json({ detail: NOT_SET_UP });
        console.error("[workflow-runs] resume failed", error);
        res.status(500).json({ detail: "Failed to resume run" });
    }
});

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

workflowGraphsRouter.get("/:graphId/triggers", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    try {
        const { data, error } = await db
            .from("gavel_workflow_triggers")
            .select("id, type, cron_expr, slug, input, enabled, next_run_at, last_run_at, created_at")
            .eq("graph_id", req.params.graphId)
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
        if (error) throw error;
        res.json({ triggers: data ?? [] });
    } catch (error) {
        if (isMissingTable(error)) return void res.json({ triggers: [] });
        console.error("[workflow-triggers] list failed", error);
        res.status(500).json({ detail: "Failed to list triggers" });
    }
});

workflowGraphsRouter.post("/:graphId/triggers", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const type = req.body?.type;
    if (type !== "cron" && type !== "webhook") {
        return void res.status(400).json({ detail: 'type must be "cron" or "webhook"' });
    }
    const input =
        req.body?.input && typeof req.body.input === "object" && !Array.isArray(req.body.input)
            ? (req.body.input as Record<string, unknown>)
            : {};
    const db = createServerSupabase();
    try {
        const { data: graph, error } = await db
            .from("gavel_workflow_graphs")
            .select("id")
            .eq("id", req.params.graphId)
            .eq("user_id", userId)
            .maybeSingle();
        if (error) throw error;
        if (!graph) return void res.status(404).json({ detail: "Workflow graph not found" });

        if (type === "cron") {
            const cronExpr = cleanText(req.body?.cron_expr, 100);
            const schedule = parseCronExpression(cronExpr);
            if ("error" in schedule) {
                return void res.status(400).json({ detail: schedule.error });
            }
            const next = nextCronRun(schedule, new Date());
            if (!next) {
                return void res.status(400).json({ detail: "cron expression never fires" });
            }
            const { data: trigger, error: insertError } = await db
                .from("gavel_workflow_triggers")
                .insert({
                    graph_id: graph.id,
                    user_id: userId,
                    type: "cron",
                    cron_expr: cronExpr,
                    input,
                    next_run_at: next.toISOString(),
                })
                .select("id, type, cron_expr, enabled, next_run_at, created_at")
                .single();
            if (insertError) throw insertError;
            logAudit({
                userId,
                action: "workflow_trigger.create",
                resourceType: "workflow_trigger",
                resourceId: trigger.id,
                req,
            });
            return void res.status(201).json(trigger);
        }

        // Webhook trigger: secret returned exactly once, stored hashed.
        const slug = crypto.randomBytes(12).toString("hex");
        const secret = crypto.randomBytes(24).toString("hex");
        const { data: trigger, error: insertError } = await db
            .from("gavel_workflow_triggers")
            .insert({
                graph_id: graph.id,
                user_id: userId,
                type: "webhook",
                slug,
                secret_hash: hashWebhookSecret(secret),
                input,
            })
            .select("id, type, slug, enabled, created_at")
            .single();
        if (insertError) throw insertError;
        logAudit({
            userId,
            action: "workflow_trigger.create",
            resourceType: "workflow_trigger",
            resourceId: trigger.id,
            req,
        });
        res.status(201).json({ ...trigger, secret });
    } catch (error) {
        if (isMissingTable(error)) return void res.status(503).json({ detail: NOT_SET_UP });
        console.error("[workflow-triggers] create failed", error);
        res.status(500).json({ detail: "Failed to create trigger" });
    }
});

workflowGraphsRouter.delete(
    "/:graphId/triggers/:triggerId",
    requireAuth,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const db = createServerSupabase();
        try {
            const { error } = await db
                .from("gavel_workflow_triggers")
                .delete()
                .eq("id", req.params.triggerId)
                .eq("graph_id", req.params.graphId)
                .eq("user_id", userId);
            if (error) throw error;
            logAudit({
                userId,
                action: "workflow_trigger.delete",
                resourceType: "workflow_trigger",
                resourceId: req.params.triggerId,
                req,
            });
            res.json({ ok: true });
        } catch (error) {
            if (isMissingTable(error)) return void res.status(503).json({ detail: NOT_SET_UP });
            console.error("[workflow-triggers] delete failed", error);
            res.status(500).json({ detail: "Failed to delete trigger" });
        }
    },
);

// ---------------------------------------------------------------------------
// Webhook entry point (no auth; secret-gated, rate-limited in index.ts)
// ---------------------------------------------------------------------------

workflowHooksRouter.post("/workflows/:slug", async (req, res) => {
    const secret =
        (typeof req.headers["x-webhook-secret"] === "string"
            ? req.headers["x-webhook-secret"]
            : null) ?? cleanText(req.query?.secret, 200);
    if (!secret) return void res.status(401).json({ detail: "Missing webhook secret" });
    const db = createServerSupabase();
    try {
        const { data: trigger, error } = await db
            .from("gavel_workflow_triggers")
            .select("id, graph_id, user_id, secret_hash, enabled, input")
            .eq("type", "webhook")
            .eq("slug", req.params.slug)
            .maybeSingle();
        if (error) throw error;
        if (!trigger || !trigger.enabled || !webhookSecretMatches(secret, trigger.secret_hash)) {
            return void res.status(404).json({ detail: "Unknown webhook" });
        }
        const payload =
            req.body && typeof req.body === "object" && !Array.isArray(req.body)
                ? (req.body as Record<string, unknown>)
                : {};
        const input = { ...(trigger.input ?? {}), ...payload };
        const runId = await createRun(db, {
            graphId: trigger.graph_id,
            userId: trigger.user_id,
            input,
            triggerSource: "webhook",
        });
        if (!runId) return void res.status(404).json({ detail: "Workflow not found" });
        await db
            .from("gavel_workflow_triggers")
            .update({ last_run_at: new Date().toISOString() })
            .eq("id", trigger.id);
        const deps = await buildEngineDepsForUser(trigger.user_id, db);
        await startRun(runId, deps);
        res.status(202).json({ run_id: runId });
    } catch (error) {
        if (isMissingTable(error)) return void res.status(503).json({ detail: NOT_SET_UP });
        console.error("[workflow-hooks] webhook failed", error);
        res.status(500).json({ detail: "Failed to start workflow run" });
    }
});
