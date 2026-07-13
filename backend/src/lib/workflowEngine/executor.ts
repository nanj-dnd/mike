// Durable workflow-run executor.
//
// The DB is the source of truth: every run and node transition is
// persisted before/after execution, so a process restart resumes a run
// by reloading gavel_workflow_node_runs and recomputing the ready set —
// succeeded nodes are reused (idempotency), interrupted nodes re-run,
// waiting human nodes keep waiting. In-process state is only the
// scheduling loop itself, mirroring the tabularRuns detached-run
// pattern (single-replica assumption; swap EnginePersistence + this
// module for a real queue later without touching node semantics).

import {
  evaluateExpression,
  interpolateTemplate,
  resolveConfigValue,
  stringifyValue,
  walkPath,
  ExpressionError,
  type PathResolver,
} from "./expressions";
import { classifyError, EngineNodeError } from "./errors";
import type {
  BranchNodeConfig,
  EdgeDef,
  EngineDeps,
  ErrorClass,
  HumanNodeConfig,
  LlmNodeConfig,
  LoopNodeConfig,
  NodeDef,
  NodeRunRow,
  RunRow,
  TransformNodeConfig,
  WorkflowDefinition,
} from "./types";
import { RETRYABLE_DEFAULT as RETRY_DEFAULT_CLASSES } from "./types";

const DEFAULT_RUN_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_NODE_TIMEOUT_MS: Record<string, number> = {
  llm: 180_000,
  branch: 180_000,
  loop: 20 * 60 * 1000,
};
const FALLBACK_NODE_TIMEOUT_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const LOOP_PARALLEL_CONCURRENCY = 3;
const MAX_BACKOFF_MS = 60_000;

type GraphOutcome = "succeeded" | "failed" | "waiting" | "canceled";

interface Scope {
  item?: unknown;
  loopIndex?: number;
  hasLoopVars: boolean;
}

interface GraphState {
  fatal: { class: ErrorClass; message: string } | null;
}

const TERMINAL_NODE_STATUSES = new Set(["succeeded", "failed", "skipped"]);

export class RunExecutor {
  private nodeStates = new Map<string, NodeRunRow>();
  private canceled = false;
  private timedOut = false;
  private cancelReject: ((err: Error) => void) | null = null;
  private cancelPromise: Promise<never>;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private runDeadlineTimer: ReturnType<typeof setTimeout> | null = null;
  /** Waiting loop nodes get one re-dispatch per executor session. */
  private redispatchableWaiting = new Set<string>();

  constructor(
    private run: RunRow,
    private definition: WorkflowDefinition,
    private deps: EngineDeps,
  ) {
    this.cancelPromise = new Promise<never>((_, reject) => {
      this.cancelReject = reject;
    });
    // Avoid unhandled-rejection noise if nothing is racing when cancel fires.
    this.cancelPromise.catch(() => {});
  }

  cancel(): void {
    if (this.canceled) return;
    this.canceled = true;
    this.cancelReject?.(new EngineNodeError("canceled", "Run canceled"));
  }

  private get sleep(): (ms: number) => Promise<void> {
    return this.deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private event(
    level: "info" | "warn" | "error",
    message: string,
    nodeId?: string,
    data?: Record<string, unknown>,
  ): void {
    void this.deps.persistence
      .appendEvent({ run_id: this.run.id, node_id: nodeId ?? null, level, message, data })
      .catch(() => {});
    console.log(`[wf-engine] run=${this.run.id}${nodeId ? ` node=${nodeId}` : ""} ${message}`);
  }

  async execute(): Promise<void> {
    const p = this.deps.persistence;
    try {
      for (const row of await p.listNodeRuns(this.run.id)) {
        this.nodeStates.set(row.node_id, row);
        // Waiting loop nodes may resolve now that a nested human node was
        // answered; give each one re-dispatch this session. (Waiting
        // human nodes re-dispatch too, harmlessly no-oping.)
        if (row.status === "waiting") {
          this.redispatchableWaiting.add(row.node_id);
        }
      }

      this.heartbeatTimer = setInterval(() => {
        void p.heartbeat(this.run.id);
      }, HEARTBEAT_INTERVAL_MS);

      const timeoutAt = this.run.timeout_at
        ? new Date(this.run.timeout_at).getTime()
        : Date.now() + (this.definition.run_timeout_ms ?? DEFAULT_RUN_TIMEOUT_MS);
      const remaining = timeoutAt - Date.now();
      if (remaining <= 0) {
        this.timedOut = true;
      } else {
        this.runDeadlineTimer = setTimeout(() => {
          this.timedOut = true;
          this.cancelReject?.(new EngineNodeError("timeout", "Run timed out"));
        }, remaining);
      }

      this.event("info", `run started (trigger: ${this.run.trigger_source})`);
      const outcome = this.timedOut
        ? "failed"
        : await this.runGraph(this.definition, "", { hasLoopVars: false });
      await this.finalize(outcome);
    } catch (error) {
      const cls = classifyError(error);
      this.event("error", `run crashed: ${cls.message}`);
      await p
        .updateRun(this.run.id, {
          status: "failed",
          error: cls.message,
          finished_at: new Date().toISOString(),
        })
        .catch(() => {});
    } finally {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      if (this.runDeadlineTimer) clearTimeout(this.runDeadlineTimer);
    }
  }

  private async finalize(outcome: GraphOutcome): Promise<void> {
    const p = this.deps.persistence;
    if (outcome === "waiting") {
      await p.updateRun(this.run.id, { status: "waiting" });
      this.event("info", "run waiting on human input");
      return;
    }
    if (outcome === "canceled" || (this.canceled && !this.timedOut)) {
      await this.skipUnfinishedNodes();
      await p.updateRun(this.run.id, {
        status: "canceled",
        finished_at: new Date().toISOString(),
      });
      this.event("info", "run canceled");
      return;
    }
    if (outcome === "failed") {
      await this.skipUnfinishedNodes();
      const firstError =
        [...this.nodeStates.values()].find(
          (row) => row.status === "failed" && row.error,
        )?.error ?? null;
      const message = this.timedOut
        ? "Run timed out"
        : (firstError?.message ?? "Workflow run failed");
      await p.updateRun(this.run.id, {
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
      });
      this.event("error", `run failed: ${message}`);
      return;
    }
    const output = this.collectRunOutput();
    await p.updateRun(this.run.id, {
      status: "succeeded",
      output,
      finished_at: new Date().toISOString(),
    });
    this.event("info", "run succeeded");
  }

  /** Run output = outputs of top-level sink nodes (no outgoing edges). */
  private collectRunOutput(): Record<string, unknown> {
    const hasOutgoing = new Set(this.definition.edges.map((e) => e.from));
    const output: Record<string, unknown> = {};
    for (const node of this.definition.nodes) {
      if (hasOutgoing.has(node.id)) continue;
      const state = this.nodeStates.get(node.id);
      if (state?.status === "succeeded") output[node.id] = state.output;
    }
    return output;
  }

  private async skipUnfinishedNodes(): Promise<void> {
    for (const [nodeId, row] of this.nodeStates) {
      if (row.status === "pending" || row.status === "running" || row.status === "waiting") {
        await this.persistNode({ ...row, status: "skipped", finished_at: new Date().toISOString() });
        void nodeId;
      }
    }
  }

  private async persistNode(row: NodeRunRow): Promise<void> {
    this.nodeStates.set(row.node_id, row);
    await this.deps.persistence.upsertNodeRun(row);
  }

  private newNodeRow(fullId: string, prefix: string): NodeRunRow {
    return {
      run_id: this.run.id,
      node_id: fullId,
      iteration_key: prefix,
      attempt: 1,
      status: "pending",
      input: null,
      output: null,
      error: null,
      idempotency_key: null,
      model: null,
      prompt_tokens: null,
      completion_tokens: null,
      started_at: null,
      finished_at: null,
    };
  }

  // --- Context resolution ---

  private makeResolver(prefix: string, scope: Scope): PathResolver {
    return (root, path) => {
      if (root === "inputs") return walkPath(this.run.input ?? {}, path);
      if (root === "item") {
        if (!scope.hasLoopVars) throw new ExpressionError("'item' is only available inside loops");
        return walkPath(scope.item, path);
      }
      if (root === "loop") {
        if (!scope.hasLoopVars) throw new ExpressionError("'loop' is only available inside loops");
        return walkPath({ index: scope.loopIndex }, path);
      }
      const state = this.nodeStates.get(prefix + root);
      if (!state || state.status !== "succeeded") {
        throw new ExpressionError(`'${root}' has no output available`);
      }
      return walkPath(state.output ?? {}, path);
    };
  }

  // --- Scheduling ---

  private async runGraph(
    def: WorkflowDefinition,
    prefix: string,
    scope: Scope,
  ): Promise<GraphOutcome> {
    const state: GraphState = { fatal: null };
    const inflight = new Map<string, Promise<void>>();
    const maxConcurrency = this.deps.maxNodeConcurrency ?? 4;

    for (;;) {
      if (this.canceled || this.timedOut) {
        await Promise.allSettled(inflight.values());
        return this.timedOut ? "failed" : "canceled";
      }
      if (state.fatal) {
        await Promise.allSettled(inflight.values());
        return "failed";
      }

      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const node of def.nodes) {
          const decided = await this.applySkipIfDead(def, prefix, scope, node);
          progressed = progressed || decided;
        }
      }

      const ready: NodeDef[] = [];
      let anyWaiting = false;
      let anyUnfinished = false;
      for (const node of def.nodes) {
        const fullId = prefix + node.id;
        if (inflight.has(fullId)) {
          anyUnfinished = true;
          continue;
        }
        const status = this.nodeStates.get(fullId)?.status ?? "pending";
        if (TERMINAL_NODE_STATUSES.has(status)) continue;
        if (status === "waiting") {
          if (this.redispatchableWaiting.has(fullId)) {
            this.redispatchableWaiting.delete(fullId);
          } else {
            anyWaiting = true;
            continue;
          }
        }
        anyUnfinished = true;
        const readiness = this.readiness(def, prefix, scope, node);
        if (readiness === "ready") ready.push(node);
        if (readiness === "error") return "failed";
      }

      if (ready.length === 0 && inflight.size === 0) {
        if (anyWaiting) return "waiting";
        if (anyUnfinished) {
          // Nothing ready, nothing running, nothing waiting: the graph is
          // stuck (should be prevented by validation).
          state.fatal = { class: "validation", message: "Workflow graph deadlocked" };
          return "failed";
        }
        const anyFatalFailure = def.nodes.some((node) => {
          const row = this.nodeStates.get(prefix + node.id);
          return row?.status === "failed" && (node.on_failure ?? "fail") === "fail";
        });
        return anyFatalFailure ? "failed" : "succeeded";
      }

      for (const node of ready.slice(0, Math.max(1, maxConcurrency - inflight.size))) {
        const fullId = prefix + node.id;
        const task = this.dispatch(def, prefix, scope, node, state).finally(() => {
          inflight.delete(fullId);
        });
        inflight.set(fullId, task);
      }
      if (inflight.size > 0) {
        await Promise.race(inflight.values());
      }
    }
  }

  /**
   * Decide whether an edge is taken. null = source not settled yet.
   * Throws EngineNodeError(validation) when a condition fails to evaluate.
   */
  private edgeTaken(
    edge: EdgeDef,
    prefix: string,
    scope: Scope,
  ): boolean | null {
    const source = this.nodeStates.get(prefix + edge.from);
    const status = source?.status ?? "pending";
    if (!TERMINAL_NODE_STATUSES.has(status)) return null;
    if (status === "skipped") return false;
    const wantFailure = edge.on === "failure";
    if (status === "failed") {
      if (!wantFailure) return false;
    } else if (wantFailure) {
      return false;
    }
    if (edge.label !== undefined) {
      const value = walkPath(source?.output ?? {}, ["value"]);
      if (stringifyValue(value) !== edge.label) return false;
    }
    if (edge.condition !== undefined) {
      try {
        return Boolean(
          evaluateExpression(edge.condition, this.makeResolver(prefix, scope)),
        );
      } catch (error) {
        throw new EngineNodeError(
          "validation",
          `Edge ${edge.from} -> ${edge.to} condition failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return true;
  }

  private readiness(
    def: WorkflowDefinition,
    prefix: string,
    scope: Scope,
    node: NodeDef,
  ): "ready" | "blocked" | "error" {
    const incoming = def.edges.filter((e) => e.to === node.id);
    if (incoming.length === 0) return "ready";
    let taken = 0;
    for (const edge of incoming) {
      let decision: boolean | null;
      try {
        decision = this.edgeTaken(edge, prefix, scope);
      } catch (error) {
        const cls = classifyError(error);
        void this.persistNode({
          ...(this.nodeStates.get(prefix + node.id) ?? this.newNodeRow(prefix + node.id, prefix)),
          status: "failed",
          error: cls,
          finished_at: new Date().toISOString(),
        });
        return "error";
      }
      if (decision === null) return "blocked";
      if (decision) taken++;
    }
    return taken > 0 ? "ready" : "blocked";
  }

  /** Mark a node skipped once every incoming edge is decidedly not-taken. */
  private async applySkipIfDead(
    def: WorkflowDefinition,
    prefix: string,
    scope: Scope,
    node: NodeDef,
  ): Promise<boolean> {
    const fullId = prefix + node.id;
    const status = this.nodeStates.get(fullId)?.status ?? "pending";
    if (status !== "pending") return false;
    const incoming = def.edges.filter((e) => e.to === node.id);
    if (incoming.length === 0) return false;
    for (const edge of incoming) {
      let decision: boolean | null;
      try {
        decision = this.edgeTaken(edge, prefix, scope);
      } catch {
        return false; // surfaced via readiness()
      }
      if (decision !== false) return false;
    }
    await this.persistNode({
      ...(this.nodeStates.get(fullId) ?? this.newNodeRow(fullId, prefix)),
      status: "skipped",
      finished_at: new Date().toISOString(),
    });
    return true;
  }

  // --- Node dispatch ---

  private async dispatch(
    def: WorkflowDefinition,
    prefix: string,
    scope: Scope,
    node: NodeDef,
    state: GraphState,
  ): Promise<void> {
    const fullId = prefix + node.id;
    const existing = this.nodeStates.get(fullId);

    // Idempotency: a node that already succeeded is never re-executed.
    if (existing?.status === "succeeded") return;

    try {
      if (node.type === "human") {
        await this.dispatchHuman(node, fullId, prefix, scope, existing);
        return;
      }
      if (node.type === "loop") {
        await this.dispatchLoop(node, fullId, prefix, scope, existing);
      } else {
        await this.executeWithRetry(def, node, fullId, prefix, scope, existing);
      }
    } catch (error) {
      const cls = classifyError(error);
      await this.persistNode({
        ...(this.nodeStates.get(fullId) ?? this.newNodeRow(fullId, prefix)),
        status: "failed",
        error: cls,
        finished_at: new Date().toISOString(),
      });
      this.event("error", `node failed: ${cls.message}`, fullId);
    }

    const settled = this.nodeStates.get(fullId);
    if (settled?.status === "failed" && (node.on_failure ?? "fail") === "fail") {
      state.fatal = settled.error ?? { class: "validation", message: "node failed" };
    }
  }

  private async dispatchHuman(
    node: NodeDef,
    fullId: string,
    prefix: string,
    scope: Scope,
    existing: NodeRunRow | undefined,
  ): Promise<void> {
    if (existing?.status === "waiting") return;
    const config = node.config as unknown as HumanNodeConfig;
    const resolver = this.makeResolver(prefix, scope);
    const prompt = interpolateTemplate(config.prompt, resolver);
    await this.persistNode({
      ...(existing ?? this.newNodeRow(fullId, prefix)),
      status: "waiting",
      input: { prompt, choices: config.choices ?? null },
      started_at: new Date().toISOString(),
    });
    this.event("info", "waiting for human input", fullId);
  }

  private async executeWithRetry(
    def: WorkflowDefinition,
    node: NodeDef,
    fullId: string,
    prefix: string,
    scope: Scope,
    existing: NodeRunRow | undefined,
  ): Promise<void> {
    const maxAttempts = Math.min(Math.max(node.retry?.max_attempts ?? 1, 1), 5);
    const backoffBase = node.retry?.backoff_ms ?? 1000;
    const retryOn = node.retry?.retry_on ?? RETRY_DEFAULT_CLASSES;
    // An attempt interrupted by a crash re-runs at the same attempt
    // number (at-least-once); succeeded rows short-circuit above.
    let attempt = existing?.status === "running" ? existing.attempt : 1;

    // Stable across retries and crash re-runs so an external call retried
    // after an ambiguous failure dedupes instead of double-applying.
    const idempotencyKey = `${this.run.id}:${fullId}`;

    for (;;) {
      const row: NodeRunRow = {
        ...(this.nodeStates.get(fullId) ?? this.newNodeRow(fullId, prefix)),
        attempt,
        status: "running",
        started_at: this.nodeStates.get(fullId)?.started_at ?? new Date().toISOString(),
        idempotency_key: idempotencyKey,
        error: null,
      };
      await this.persistNode(row);
      try {
        const result = await this.withNodeTimeout(
          this.executeNodeOnce(node, fullId, prefix, scope),
          node,
        );
        await this.persistNode({
          ...this.nodeStates.get(fullId)!,
          status: "succeeded",
          output: result.output,
          input: result.input ?? this.nodeStates.get(fullId)!.input,
          model: result.model ?? null,
          prompt_tokens: result.usage?.prompt_tokens ?? null,
          completion_tokens: result.usage?.completion_tokens ?? null,
          finished_at: new Date().toISOString(),
        });
        return;
      } catch (error) {
        const cls = classifyError(error);
        if (cls.class === "canceled") throw error;
        const retryable = attempt < maxAttempts && retryOn.includes(cls.class);
        this.event(
          retryable ? "warn" : "error",
          `attempt ${attempt}/${maxAttempts} ${retryable ? "will retry" : "failed"}: ${cls.message}`,
          fullId,
          { error_class: cls.class },
        );
        if (!retryable) {
          await this.persistNode({
            ...this.nodeStates.get(fullId)!,
            status: "failed",
            error: cls,
            finished_at: new Date().toISOString(),
          });
          return;
        }
        const backoff = Math.min(backoffBase * 2 ** (attempt - 1), MAX_BACKOFF_MS);
        await Promise.race([this.sleep(backoff), this.cancelPromise]);
        attempt++;
      }
    }
  }

  private async withNodeTimeout<T>(promise: Promise<T>, node: NodeDef): Promise<T> {
    const ms =
      node.timeout_ms ?? DEFAULT_NODE_TIMEOUT_MS[node.type] ?? FALLBACK_NODE_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new EngineNodeError("timeout", `Node timed out after ${ms}ms`)),
        ms,
      );
    });
    try {
      return await Promise.race([promise, timeout, this.cancelPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async executeNodeOnce(
    node: NodeDef,
    fullId: string,
    prefix: string,
    scope: Scope,
  ): Promise<{
    output: Record<string, unknown>;
    input?: unknown;
    model?: string;
    usage?: { prompt_tokens: number; completion_tokens: number } | null;
  }> {
    const resolver = this.makeResolver(prefix, scope);
    switch (node.type) {
      case "llm":
        return this.executeLlmNode(
          node.config as unknown as LlmNodeConfig,
          resolver,
          this.nodeStates.get(fullId)?.idempotency_key ?? undefined,
        );
      case "transform": {
        const config = node.config as unknown as TransformNodeConfig;
        const output: Record<string, unknown> = {};
        for (const [name, expr] of Object.entries(config.outputs)) {
          try {
            output[name] = evaluateExpression(expr, resolver);
          } catch (error) {
            throw new EngineNodeError(
              "validation",
              `transform output '${name}': ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        return { output, input: config.outputs };
      }
      case "branch":
        return this.executeBranchNode(node.config as unknown as BranchNodeConfig, resolver);
      case "parallel":
        return { output: {} };
      case "join": {
        const values: Record<string, unknown> = {};
        for (const edge of this.currentDefEdgesInto(node, prefix)) {
          const source = this.nodeStates.get(prefix + edge.from);
          if (source?.status === "succeeded") values[edge.from] = source.output;
        }
        return { output: { values } };
      }
      default:
        throw new EngineNodeError("validation", `Unhandled node type: ${node.type}`);
    }
  }

  /** Edges into `node` at this graph level (loop bodies track their own). */
  private currentDefEdgesInto(node: NodeDef, prefix: string): EdgeDef[] {
    const def = this.findDefForPrefix(prefix);
    return def ? def.edges.filter((e) => e.to === node.id) : [];
  }

  private findDefForPrefix(prefix: string): WorkflowDefinition | null {
    if (prefix === "") return this.definition;
    // prefix looks like 'loopA#3.' or nested 'loopA#3.loopB#1.'
    let def: WorkflowDefinition | null = this.definition;
    for (const part of prefix.split(".").filter(Boolean)) {
      const loopId = part.split("#")[0];
      const loopNode: NodeDef | undefined = def?.nodes.find((n) => n.id === loopId);
      if (!loopNode || loopNode.type !== "loop") return null;
      def = (loopNode.config as unknown as LoopNodeConfig).body;
    }
    return def;
  }

  private async executeLlmNode(
    config: LlmNodeConfig,
    resolver: PathResolver,
    idempotencyKey?: string,
  ): Promise<{
    output: Record<string, unknown>;
    input: unknown;
    model?: string;
    usage?: { prompt_tokens: number; completion_tokens: number } | null;
  }> {
    const resolved = this.deps.llm.resolveNodeModel(config.model, config.model_tier);
    if ("error" in resolved) throw new EngineNodeError("validation", resolved.error);
    let prompt: string;
    let system: string | undefined;
    try {
      prompt = interpolateTemplate(config.prompt, resolver);
      system = config.system_prompt
        ? interpolateTemplate(config.system_prompt, resolver)
        : undefined;
    } catch (error) {
      throw new EngineNodeError(
        "validation",
        `prompt interpolation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const { text, usage } = await this.deps.llm.complete({
      model: resolved.model,
      systemPrompt: system,
      prompt,
      maxTokens: config.max_tokens,
      idempotencyKey,
    });
    const output: Record<string, unknown> = { text };
    if (config.output === "json") {
      const parsed = tryParseJson(text);
      if (parsed.ok) {
        output.json = parsed.value;
      } else {
        throw new EngineNodeError(
          "validation",
          "LLM node expected JSON output but the completion was not valid JSON",
        );
      }
    }
    return {
      output,
      input: { prompt, system_prompt: system ?? null },
      model: resolved.model,
      usage,
    };
  }

  private async executeBranchNode(
    config: BranchNodeConfig,
    resolver: PathResolver,
  ): Promise<{
    output: Record<string, unknown>;
    input: unknown;
    model?: string;
    usage?: { prompt_tokens: number; completion_tokens: number } | null;
  }> {
    if (config.expression) {
      try {
        const value = evaluateExpression(config.expression, resolver);
        return { output: { value }, input: { expression: config.expression } };
      } catch (error) {
        throw new EngineNodeError(
          "validation",
          `branch expression failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const llm = config.llm!;
    const resolved = this.deps.llm.resolveNodeModel(llm.model, llm.model_tier ?? "low");
    if ("error" in resolved) throw new EngineNodeError("validation", resolved.error);
    const prompt = interpolateTemplate(llm.prompt, resolver);
    const instruction = `${prompt}\n\nAnswer with exactly one of: ${llm.choices.join(" | ")}. Reply with the choice only.`;
    const { text, usage } = await this.deps.llm.complete({
      model: resolved.model,
      prompt: instruction,
      maxTokens: 64,
    });
    const value = coerceChoice(text, llm.choices);
    if (value === null) {
      throw new EngineNodeError(
        "validation",
        `branch classifier returned '${text.trim().slice(0, 80)}', not one of the configured choices`,
      );
    }
    return {
      output: { value },
      input: { prompt: instruction, choices: llm.choices },
      model: resolved.model,
      usage,
    };
  }

  // --- Loop node ---

  private async dispatchLoop(
    node: NodeDef,
    fullId: string,
    prefix: string,
    scope: Scope,
    existing: NodeRunRow | undefined,
  ): Promise<void> {
    const config = node.config as unknown as LoopNodeConfig;
    const resolver = this.makeResolver(prefix, scope);
    const priorOutput = (existing?.output ?? {}) as {
      results?: unknown[];
      next_index?: number;
    };
    const results: unknown[] = Array.isArray(priorOutput.results)
      ? [...priorOutput.results]
      : [];
    let index = typeof priorOutput.next_index === "number" ? priorOutput.next_index : 0;
    const cap = Math.min(Math.max(config.max_iterations, 1), 200);

    const baseRow = () => ({
      ...(this.nodeStates.get(fullId) ?? this.newNodeRow(fullId, prefix)),
    });
    const startedAt =
      this.nodeStates.get(fullId)?.started_at ?? new Date().toISOString();
    await this.persistNode({
      ...baseRow(),
      status: "running",
      started_at: startedAt,
      output: { results, next_index: index },
      error: null,
    });

    // Loops don't go through withNodeTimeout (an iteration mid-flight must
    // persist its own state), so enforce the node timeout between
    // iterations. Anchored to the persisted started_at, the wall-clock
    // budget survives crash-resume.
    const loopTimeoutMs = node.timeout_ms ?? DEFAULT_NODE_TIMEOUT_MS.loop;
    const loopDeadline = new Date(startedAt).getTime() + loopTimeoutMs;
    const loopDeadlinePassed = () => Date.now() > loopDeadline;
    const checkLoopDeadline = () => {
      if (loopDeadlinePassed()) {
        throw new EngineNodeError("timeout", `Loop node timed out after ${loopTimeoutMs}ms`);
      }
    };

    const persistProgress = async (status: NodeRunRow["status"]) => {
      await this.persistNode({
        ...baseRow(),
        status,
        output: { results, next_index: index, count: results.length },
        ...(TERMINAL_NODE_STATUSES.has(status)
          ? { finished_at: new Date().toISOString() }
          : {}),
      });
    };

    const runIteration = async (i: number, item: unknown): Promise<GraphOutcome> => {
      const bodyPrefix = `${fullId}#${i}.`;
      const bodyScope: Scope = { item, loopIndex: i, hasLoopVars: true };
      const outcome = await this.runGraph(config.body, bodyPrefix, bodyScope);
      if (outcome === "succeeded") {
        results[i] = config.result
          ? evaluateExpression(config.result, this.makeResolver(bodyPrefix, bodyScope))
          : null;
      }
      return outcome;
    };

    if (config.for_each) {
      let items: unknown;
      try {
        items = evaluateExpression(config.for_each, resolver);
      } catch (error) {
        throw new EngineNodeError(
          "validation",
          `loop for_each failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!Array.isArray(items)) {
        throw new EngineNodeError("validation", "loop for_each must resolve to an array");
      }
      const total = Math.min(items.length, cap);
      if (items.length > cap) {
        this.event("warn", `loop truncated: ${items.length} items, cap ${cap}`, fullId);
      }

      if (config.mode === "parallel") {
        // Parallel loops always re-walk every iteration on resume: body
        // subgraphs whose nodes already succeeded settle instantly from
        // persisted state, so next_index stays 0 until the loop finishes.
        index = 0;
        const outcomes: GraphOutcome[] = [];
        let cursor = 0;
        const workers = Array.from(
          { length: Math.min(LOOP_PARALLEL_CONCURRENCY, Math.max(total, 1)) },
          async () => {
            for (;;) {
              const i = cursor++;
              if (i >= total || this.canceled || this.timedOut || loopDeadlinePassed()) return;
              outcomes.push(await runIteration(i, items[i]));
            }
          },
        );
        await Promise.all(workers);
        if (this.canceled || this.timedOut) return;
        if (outcomes.length < total) checkLoopDeadline();
        if (outcomes.includes("failed")) {
          throw new EngineNodeError("validation", "a loop iteration failed");
        }
        if (outcomes.includes("waiting")) {
          await persistProgress("waiting");
          return;
        }
        index = total;
      } else {
        while (index < total) {
          if (this.canceled || this.timedOut) return;
          checkLoopDeadline();
          const outcome = await runIteration(index, items[index]);
          if (outcome === "canceled") return;
          if (outcome === "failed") {
            await persistProgress("running");
            throw new EngineNodeError("validation", `loop iteration ${index} failed`);
          }
          if (outcome === "waiting") {
            await persistProgress("waiting");
            return;
          }
          index++;
          await persistProgress("running");
        }
      }
    } else {
      // while mode — condition sees loop.index; always sequential.
      for (;;) {
        if (this.canceled || this.timedOut) return;
        checkLoopDeadline();
        if (index >= cap) break;
        let keepGoing: boolean;
        try {
          keepGoing = Boolean(
            evaluateExpression(config.while!, (root, path) => {
              if (root === "loop") return walkPath({ index }, path);
              if (root === "item") return walkPath(results[index - 1] ?? null, path);
              return this.makeResolver(prefix, scope)(root, path);
            }),
          );
        } catch (error) {
          throw new EngineNodeError(
            "validation",
            `loop while condition failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (!keepGoing) break;
        const outcome = await runIteration(index, results[index - 1] ?? null);
        if (outcome === "canceled") return;
        if (outcome === "failed") {
          await persistProgress("running");
          throw new EngineNodeError("validation", `loop iteration ${index} failed`);
        }
        if (outcome === "waiting") {
          await persistProgress("waiting");
          return;
        }
        index++;
        await persistProgress("running");
      }
    }

    await persistProgress("succeeded");
  }
}

function coerceChoice(text: string, choices: string[]): string | null {
  const cleaned = text.trim().toLowerCase().replace(/^["'`]|["'`.]$/g, "");
  for (const choice of choices) {
    if (cleaned === choice.trim().toLowerCase()) return choice;
  }
  for (const choice of choices) {
    if (cleaned.includes(choice.trim().toLowerCase())) return choice;
  }
  return null;
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const candidates = [stripped];
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(stripped.slice(firstBrace, lastBrace + 1));
  }
  const firstBracket = stripped.indexOf("[");
  const lastBracket = stripped.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    candidates.push(stripped.slice(firstBracket, lastBracket + 1));
  }
  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // try next candidate
    }
  }
  return { ok: false };
}
