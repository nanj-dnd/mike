// Workflow engine public API: start/cancel/resume runs, crash recovery,
// the cron/trigger tick, and the wrapper that runs legacy prompt-template
// workflows as single-LLM-node graphs.

import crypto from "crypto";
import { createServerSupabase } from "../supabase";
import { getUserModelSettings } from "../userSettings";
import {
  completeTextResult,
  defaultModelForKeys,
  missingModelApiKey,
  resolveModel,
  type UserApiKeys,
} from "../llm";
import { RunExecutor } from "./executor";
import { SupabaseEnginePersistence } from "./persistence";
import { parseCronExpression, nextCronRun } from "./cron";
import type {
  EngineDeps,
  EngineLlm,
  EnginePersistence,
  RunRow,
  TriggerSource,
  WorkflowDefinition,
} from "./types";

export * from "./types";
export { validateWorkflowDefinition } from "./validation";
export { parseCronExpression, nextCronRun } from "./cron";
export { InMemoryEnginePersistence, SupabaseEnginePersistence } from "./persistence";
export { RunExecutor } from "./executor";
export { classifyError, EngineNodeError } from "./errors";

type Db = ReturnType<typeof createServerSupabase>;

const STALE_HEARTBEAT_MS = 90_000;
const ENGINE_TICK_MS = 30_000;

// In-process registry of active executors (cancellation + dedupe). Like
// tabularRuns.ts this assumes a single backend replica; the durable state
// in Postgres is what makes restarts safe.
const activeExecutors = new Map<string, { executor: RunExecutor; done: Promise<void> }>();

let engineDisabled = false;

export function isEngineMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /42P01|could not find the table|schema cache/i.test(message);
}

function warnEngineDisabled(error: unknown): void {
  if (engineDisabled) return;
  engineDisabled = true;
  console.warn(
    "[wf-engine] disabled — apply supabase/migrations/20260713_01_gavel_workflow_engine.sql to enable the workflow engine.",
    error instanceof Error ? error.message : error,
  );
}

/** Production LLM dependency: BYO-key completion via the shared adapters. */
export function buildEngineLlm(apiKeys: UserApiKeys): EngineLlm {
  return {
    resolveNodeModel(model, tier) {
      const resolved = model
        ? resolveModel(model, "")
        : defaultModelForKeys(tier ?? "mid", apiKeys);
      if (!resolved) return { error: `Unknown model: ${model}` };
      const missing = missingModelApiKey(resolved, apiKeys);
      if (missing) return { error: missing.detail };
      return { model: resolved };
    },
    async complete(params) {
      const result = await completeTextResult({
        model: params.model,
        systemPrompt: params.systemPrompt,
        user: params.prompt,
        maxTokens: params.maxTokens ?? 4096,
        apiKeys,
      });
      return { text: result.text, usage: result.usage };
    },
  };
}

export async function buildEngineDepsForUser(
  userId: string,
  db: Db,
): Promise<EngineDeps> {
  const settings = await getUserModelSettings(userId, db);
  return {
    persistence: new SupabaseEnginePersistence(db),
    llm: buildEngineLlm(settings.api_keys),
  };
}

/**
 * Start (or adopt) a run in the background. Resolves when the run is
 * claimed and executing; the returned done promise tracks completion.
 */
export async function startRun(
  runId: string,
  deps: EngineDeps,
  options?: { reclaimStaleBefore?: string },
): Promise<{ started: boolean; done: Promise<void> }> {
  const active = activeExecutors.get(runId);
  if (active) return { started: false, done: active.done };

  const claimed = options?.reclaimStaleBefore
    ? await deps.persistence.reclaimStaleRun(runId, options.reclaimStaleBefore)
    : await deps.persistence.claimRun(runId);
  if (!claimed) {
    return { started: false, done: Promise.resolve() };
  }

  const run = await deps.persistence.getRun(runId);
  if (!run) return { started: false, done: Promise.resolve() };

  const definition = await deps.persistence.getDefinition(run.version_id);
  if (!definition) {
    await deps.persistence.updateRun(runId, {
      status: "failed",
      error: "Workflow definition version not found",
      finished_at: new Date().toISOString(),
    });
    return { started: false, done: Promise.resolve() };
  }

  if (!run.timeout_at) {
    const timeoutAt = new Date(
      Date.now() + (definition.run_timeout_ms ?? 30 * 60 * 1000),
    ).toISOString();
    await deps.persistence.updateRun(runId, { timeout_at: timeoutAt });
    run.timeout_at = timeoutAt;
  }

  const executor = new RunExecutor(run, definition, deps);
  const done = executor
    .execute()
    .catch((error) => {
      console.error(`[wf-engine] run ${runId} crashed:`, error);
    })
    .finally(() => {
      activeExecutors.delete(runId);
    });
  activeExecutors.set(runId, { executor, done });
  return { started: true, done };
}

/** Cancel a run: aborts in-process work, or flips DB state for orphans. */
export async function cancelRun(
  runId: string,
  persistence: EnginePersistence,
): Promise<{ ok: boolean; detail?: string }> {
  const run = await persistence.getRun(runId);
  if (!run) return { ok: false, detail: "Run not found" };
  if (["succeeded", "failed", "canceled"].includes(run.status)) {
    return { ok: false, detail: `Run already ${run.status}` };
  }
  const active = activeExecutors.get(runId);
  if (active) {
    active.executor.cancel();
    await active.done;
    return { ok: true };
  }
  await persistence.updateRun(runId, {
    status: "canceled",
    finished_at: new Date().toISOString(),
  });
  return { ok: true };
}

/** Provide a waiting human node's input and resume the run. */
export async function resumeHumanNode(
  runId: string,
  nodeId: string,
  response: unknown,
  deps: EngineDeps,
): Promise<{ ok: boolean; detail?: string }> {
  const run = await deps.persistence.getRun(runId);
  if (!run) return { ok: false, detail: "Run not found" };
  if (run.status !== "waiting") {
    return { ok: false, detail: `Run is ${run.status}, not waiting` };
  }
  const nodeRuns = await deps.persistence.listNodeRuns(runId);
  const node = nodeRuns.find((row) => row.node_id === nodeId);
  if (!node) return { ok: false, detail: "Node not found in this run" };
  if (node.status !== "waiting") {
    return { ok: false, detail: `Node is ${node.status}, not waiting` };
  }
  await deps.persistence.upsertNodeRun({
    ...node,
    status: "succeeded",
    output: { response: response ?? null },
    finished_at: new Date().toISOString(),
  });
  await deps.persistence.appendEvent({
    run_id: runId,
    node_id: nodeId,
    level: "info",
    message: "human input received",
  });
  await startRun(runId, deps);
  return { ok: true };
}

/** Boot/tick recovery: adopt crashed and never-started runs. */
export async function recoverInterruptedRuns(db: Db): Promise<void> {
  if (engineDisabled) return;
  const persistence = new SupabaseEnginePersistence(db);
  const staleBefore = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
  let runs: RunRow[];
  try {
    runs = await persistence.listResumableRuns(staleBefore);
  } catch (error) {
    if (isEngineMissingTableError(error)) warnEngineDisabled(error);
    return;
  }
  for (const run of runs) {
    if (activeExecutors.has(run.id)) continue;
    try {
      const deps = await buildEngineDepsForUser(run.user_id, db);
      await startRun(run.id, deps, {
        reclaimStaleBefore: run.status === "running" ? staleBefore : undefined,
      });
      console.log(`[wf-engine] recovered run ${run.id} (${run.status})`);
    } catch (error) {
      console.error(`[wf-engine] failed to recover run ${run.id}:`, error);
    }
  }
}

/** Fire due cron triggers. Returns the number of runs started. */
export async function fireDueCronTriggers(db: Db): Promise<number> {
  if (engineDisabled) return 0;
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("gavel_workflow_triggers")
    .select("*")
    .eq("type", "cron")
    .eq("enabled", true)
    .lte("next_run_at", nowIso)
    .limit(20);
  if (error) {
    if (isEngineMissingTableError(error)) warnEngineDisabled(error);
    return 0;
  }
  let started = 0;
  for (const trigger of data ?? []) {
    const schedule = trigger.cron_expr ? parseCronExpression(trigger.cron_expr) : null;
    const next =
      schedule && !("error" in schedule) ? nextCronRun(schedule, new Date()) : null;
    // Claim by advancing next_run_at; matched rows are ours.
    const { data: claimed } = await db
      .from("gavel_workflow_triggers")
      .update({
        next_run_at: next?.toISOString() ?? null,
        last_run_at: nowIso,
        ...(next ? {} : { enabled: false }),
      })
      .eq("id", trigger.id)
      .lte("next_run_at", nowIso)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    try {
      const runId = await createRun(db, {
        graphId: trigger.graph_id,
        userId: trigger.user_id,
        input: (trigger.input as Record<string, unknown> | null) ?? {},
        triggerSource: "cron",
      });
      if (runId) {
        const deps = await buildEngineDepsForUser(trigger.user_id, db);
        await startRun(runId, deps);
        started++;
      }
    } catch (error) {
      console.error(`[wf-engine] cron trigger ${trigger.id} failed to start run:`, error);
    }
  }
  return started;
}

/** Insert a run row for a graph's latest version. Null if graph missing. */
export async function createRun(
  db: Db,
  params: {
    graphId: string;
    userId: string;
    input: Record<string, unknown>;
    triggerSource: TriggerSource;
  },
): Promise<string | null> {
  const { data: graph, error: graphError } = await db
    .from("gavel_workflow_graphs")
    .select("id, latest_version")
    .eq("id", params.graphId)
    .maybeSingle();
  if (graphError) throw graphError;
  if (!graph) return null;
  const { data: version, error: versionError } = await db
    .from("gavel_workflow_graph_versions")
    .select("id")
    .eq("graph_id", params.graphId)
    .eq("version", graph.latest_version)
    .maybeSingle();
  if (versionError) throw versionError;
  if (!version) return null;
  const { data: run, error: runError } = await db
    .from("gavel_workflow_runs")
    .insert({
      graph_id: params.graphId,
      version_id: version.id,
      user_id: params.userId,
      status: "pending",
      trigger_source: params.triggerSource,
      input: params.input,
    })
    .select("id")
    .single();
  if (runError) throw runError;
  return run.id as string;
}

let tickTimer: ReturnType<typeof setInterval> | null = null;

/** Start the background engine loop (call once from index.ts). */
export function startEngineBackground(): void {
  if (tickTimer) return;
  const tick = async () => {
    const db = createServerSupabase();
    try {
      await recoverInterruptedRuns(db);
      await fireDueCronTriggers(db);
    } catch (error) {
      console.error("[wf-engine] tick failed:", error);
    }
  };
  tickTimer = setInterval(() => void tick(), ENGINE_TICK_MS);
  tickTimer.unref?.();
  // Recover promptly on boot.
  setTimeout(() => void tick(), 3_000).unref?.();
}

/**
 * Back-compat: wrap a legacy prompt-template workflow (assistant type) as
 * a single-LLM-node graph owned by the user, reusing the wrapper across
 * executions. Returns the graph id.
 */
export async function ensureTemplateGraph(
  db: Db,
  params: {
    userId: string;
    templateWorkflowId: string;
    title: string;
    skillMd: string;
  },
): Promise<string> {
  const { data: existing, error: findError } = await db
    .from("gavel_workflow_graphs")
    .select("id, latest_version")
    .eq("user_id", params.userId)
    .eq("template_workflow_id", params.templateWorkflowId)
    .maybeSingle();
  if (findError) throw findError;

  const definition: WorkflowDefinition = {
    inputs: [{ name: "request", description: "Optional extra instructions" }],
    nodes: [
      {
        id: "template",
        type: "llm",
        config: {
          system_prompt:
            "You are a legal assistant executing a saved workflow. Follow the workflow instructions faithfully.",
          prompt: `${params.skillMd}\n\n{{inputs.request}}`,
          model_tier: "mid",
        },
        retry: { max_attempts: 3, backoff_ms: 2000 },
        timeout_ms: 300_000,
      },
    ],
    edges: [],
  };

  if (existing) {
    const nextVersion = existing.latest_version + 1;
    const { error: versionError } = await db
      .from("gavel_workflow_graph_versions")
      .insert({
        graph_id: existing.id,
        version: nextVersion,
        definition,
      });
    if (versionError) throw versionError;
    const { error: updateError } = await db
      .from("gavel_workflow_graphs")
      .update({ latest_version: nextVersion, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return existing.id as string;
  }

  const { data: graph, error: insertError } = await db
    .from("gavel_workflow_graphs")
    .insert({
      user_id: params.userId,
      name: params.title,
      description: "Auto-generated from a prompt-template workflow",
      template_workflow_id: params.templateWorkflowId,
      latest_version: 1,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  const { error: versionError } = await db
    .from("gavel_workflow_graph_versions")
    .insert({ graph_id: graph.id, version: 1, definition });
  if (versionError) throw versionError;
  return graph.id as string;
}

/** Hash webhook secrets at rest; compare with timing-safe equality. */
export function hashWebhookSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function webhookSecretMatches(secret: string, hash: string | null): boolean {
  if (!hash) return false;
  const candidate = hashWebhookSecret(secret);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
