// Workflow orchestration engine — shared types.
//
// A workflow is a DAG of typed nodes stored as JSON (versioned in
// gavel_workflow_graph_versions). Cycles are only expressible through
// loop nodes, whose bodies are nested definitions. Data flows through a
// run context: node inputs reference upstream outputs with {{ref}}
// expressions and every node produces named outputs.

export type NodeType =
  | "llm"
  | "transform"
  | "branch"
  | "parallel"
  | "join"
  | "loop"
  | "human";

export type RunStatus =
  | "pending"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "canceled";

export type NodeStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "waiting";

export type TriggerSource = "manual" | "cron" | "webhook" | "template";

/** Error classes used by retry policies. */
export type ErrorClass =
  | "rate_limit"
  | "timeout"
  | "server_error"
  | "validation"
  | "canceled";

export const RETRYABLE_DEFAULT: ErrorClass[] = [
  "rate_limit",
  "timeout",
  "server_error",
];

export interface RetryPolicy {
  /** Total attempts including the first. Default 1 (no retry). Max 5. */
  max_attempts?: number;
  /** Base backoff in ms; attempt n sleeps base * 2^(n-1), capped at 60s. */
  backoff_ms?: number;
  /** Which error classes trigger a retry. Default rate_limit/timeout/server_error. */
  retry_on?: ErrorClass[];
}

export type FailurePolicy = "fail" | "continue" | "fallback";

export interface NodeDef {
  id: string;
  type: NodeType;
  /** Per-type configuration; see node executors for exact shapes. */
  config: Record<string, unknown>;
  retry?: RetryPolicy;
  timeout_ms?: number;
  /**
   * fail (default): a final failure fails the run.
   * continue/fallback: the run keeps going; edges with on:"failure"
   * from this node activate instead of its success edges.
   */
  on_failure?: FailurePolicy;
}

export interface EdgeDef {
  from: string;
  to: string;
  /** Edge activates on source success (default) or failure (fallback routing). */
  on?: "success" | "failure";
  /** Expression evaluated against the run context when the source settles. */
  condition?: string;
  /** Shorthand for branch nodes: taken when String(source.value) === label. */
  label?: string;
}

export interface WorkflowInputDef {
  name: string;
  description?: string;
  required?: boolean;
}

export interface WorkflowDefinition {
  inputs?: WorkflowInputDef[];
  nodes: NodeDef[];
  edges: EdgeDef[];
  /** Whole-run timeout. Default 30 minutes, max 24h. */
  run_timeout_ms?: number;
}

// --- Node config shapes (validated in validation.ts) ---

export interface LlmNodeConfig {
  prompt: string;
  system_prompt?: string;
  /** Explicit model id; otherwise model_tier resolves from the user's keys. */
  model?: string;
  model_tier?: "low" | "mid";
  /** "json" additionally parses the completion into outputs.json. */
  output?: "text" | "json";
  max_tokens?: number;
}

export interface TransformNodeConfig {
  /** Each entry is an expression; its value becomes outputs[name]. */
  outputs: Record<string, string>;
}

export interface BranchNodeConfig {
  /** Deterministic branch: expression whose value becomes outputs.value. */
  expression?: string;
  /** LLM-classified branch: completion coerced to one of `choices`. */
  llm?: {
    prompt: string;
    choices: string[];
    model?: string;
    model_tier?: "low" | "mid";
  };
}

export interface LoopNodeConfig {
  /** forEach mode: expression resolving to an array. */
  for_each?: string;
  /** while mode: condition checked before each iteration. */
  while?: string;
  /** Hard iteration cap. Required. 1..200. */
  max_iterations: number;
  mode?: "sequential" | "parallel";
  body: WorkflowDefinition;
  /** Expression evaluated in body scope after each iteration; collected into outputs.results. */
  result?: string;
}

export interface HumanNodeConfig {
  /** Message shown to the approver (interpolated). */
  prompt: string;
  choices?: string[];
}

// --- Persisted rows ---

export interface RunRow {
  id: string;
  graph_id: string;
  version_id: string;
  user_id: string;
  status: RunStatus;
  trigger_source: TriggerSource;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  heartbeat_at: string | null;
  timeout_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface NodeRunRow {
  run_id: string;
  /** Full id, loop-body nodes namespaced '<loopId>#<i>.<bodyId>'. */
  node_id: string;
  iteration_key: string;
  attempt: number;
  status: NodeStatus;
  input: unknown;
  output: Record<string, unknown> | null;
  error: { class: ErrorClass; message: string } | null;
  idempotency_key: string | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface RunEvent {
  run_id: string;
  node_id?: string | null;
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown> | null;
}

export interface TriggerRow {
  id: string;
  graph_id: string;
  user_id: string;
  type: "cron" | "webhook";
  cron_expr: string | null;
  slug: string | null;
  secret_hash: string | null;
  input: Record<string, unknown> | null;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
}

// --- Injectable dependencies ---

export interface LlmCompleteParams {
  model: string;
  systemPrompt?: string;
  prompt: string;
  maxTokens?: number;
}

export interface LlmUsageTotals {
  prompt_tokens: number;
  completion_tokens: number;
}

/** Narrow LLM interface so tests inject fakes and providers stay swappable. */
export interface EngineLlm {
  complete(
    params: LlmCompleteParams,
  ): Promise<{ text: string; usage: LlmUsageTotals | null }>;
  /** Resolve an explicit model id or a tier to a concrete, key-backed model. */
  resolveNodeModel(
    model: string | undefined,
    tier: "low" | "mid" | undefined,
  ): { model: string } | { error: string };
}

export interface EnginePersistence {
  getRun(runId: string): Promise<RunRow | null>;
  /** Atomic pending/waiting->running claim; false when another executor won. */
  claimRun(runId: string): Promise<boolean>;
  /** Adopt a 'running' run whose heartbeat went stale (crashed process). */
  reclaimStaleRun(runId: string, staleBefore: string): Promise<boolean>;
  /** Runs needing recovery: stale-running plus never-started pending. */
  listResumableRuns(staleBefore: string): Promise<RunRow[]>;
  updateRun(runId: string, patch: Partial<RunRow>): Promise<void>;
  heartbeat(runId: string): Promise<void>;
  listNodeRuns(runId: string): Promise<NodeRunRow[]>;
  upsertNodeRun(row: NodeRunRow): Promise<void>;
  appendEvent(event: RunEvent): Promise<void>;
  getDefinition(versionId: string): Promise<WorkflowDefinition | null>;
}

export interface EngineDeps {
  persistence: EnginePersistence;
  llm: EngineLlm;
  sleep?: (ms: number) => Promise<void>;
  /** Max nodes of one run executing concurrently. Default 4. */
  maxNodeConcurrency?: number;
}
