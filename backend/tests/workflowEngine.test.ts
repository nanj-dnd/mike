import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateExpression,
  interpolateTemplate,
  walkPath,
} from "../src/lib/workflowEngine/expressions";
import { validateWorkflowDefinition } from "../src/lib/workflowEngine/validation";
import { parseCronExpression, nextCronRun } from "../src/lib/workflowEngine/cron";
import { classifyError } from "../src/lib/workflowEngine/errors";
import { InMemoryEnginePersistence } from "../src/lib/workflowEngine/persistence";
import { RunExecutor } from "../src/lib/workflowEngine/executor";
import type {
  EngineDeps,
  EngineLlm,
  RunRow,
  WorkflowDefinition,
} from "../src/lib/workflowEngine/types";

// --- helpers ---------------------------------------------------------------

function fakeLlm(
  handler: (prompt: string) => string | Promise<string>,
): EngineLlm & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    resolveNodeModel: () => ({ model: "gemini-3-flash-preview" }),
    async complete({ prompt }) {
      calls.push(prompt);
      return {
        text: await handler(prompt),
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      };
    },
  };
}

function makeRun(input: Record<string, unknown> = {}): RunRow {
  return {
    id: "run-1",
    graph_id: "graph-1",
    version_id: "v-1",
    user_id: "user-1",
    status: "running",
    trigger_source: "manual",
    input,
    output: null,
    error: null,
    heartbeat_at: null,
    timeout_at: null,
    started_at: new Date().toISOString(),
    finished_at: null,
    created_at: new Date().toISOString(),
  };
}

async function executeRun(
  definition: WorkflowDefinition,
  llm: EngineLlm,
  input: Record<string, unknown> = {},
  persistence = new InMemoryEnginePersistence(),
): Promise<{ persistence: InMemoryEnginePersistence; run: RunRow }> {
  const run = makeRun(input);
  persistence.seedRun(run, definition);
  const deps: EngineDeps = { persistence, llm, sleep: async () => {} };
  const executor = new RunExecutor(run, definition, deps);
  await executor.execute();
  const final = await persistence.getRun(run.id);
  return { persistence, run: final! };
}

function nodeStatus(p: InMemoryEnginePersistence, nodeId: string): string | undefined {
  return [...p.nodeRuns.values()].find((r) => r.node_id === nodeId)?.status;
}

function nodeOutput(p: InMemoryEnginePersistence, nodeId: string): unknown {
  return [...p.nodeRuns.values()].find((r) => r.node_id === nodeId)?.output;
}

// --- expressions -----------------------------------------------------------

test("expressions: literals, operators, and functions", () => {
  const resolver = () => null;
  assert.equal(evaluateExpression("1 + 2 * 3", resolver), 7);
  assert.equal(evaluateExpression("'a' + 'b'", resolver), "ab");
  assert.equal(evaluateExpression("len('abc') == 3 && !false", resolver), true);
  assert.equal(evaluateExpression("default(null, 'x')", resolver), "x");
  assert.equal(evaluateExpression("contains('hello world', 'world')", resolver), true);
});

test("expressions: path resolution and templates", () => {
  const ctx: Record<string, unknown> = {
    inputs: { name: "Asha", items: [1, 2, 3] },
    node1: { text: "done" },
  };
  const resolver = (root: string, path: (string | number)[]) =>
    walkPath(ctx[root], path);
  assert.equal(evaluateExpression("inputs.name", resolver), "Asha");
  assert.equal(evaluateExpression("inputs.items[1]", resolver), 2);
  assert.equal(evaluateExpression("{{node1.text}}", resolver), "done");
  assert.equal(
    interpolateTemplate("Hi {{inputs.name}}, status: {{node1.text}}!", resolver),
    "Hi Asha, status: done!",
  );
});

test("expressions: prototype access is blocked", () => {
  assert.equal(walkPath({ a: 1 }, ["__proto__"]), undefined);
  assert.equal(walkPath({ a: 1 }, ["constructor"]), undefined);
});

// --- error classification ---------------------------------------------------

test("classifyError: retryable vs non-retryable", () => {
  assert.equal(classifyError(new Error("429 rate limit exceeded")).class, "rate_limit");
  assert.equal(classifyError(new Error("Request timed out")).class, "timeout");
  assert.equal(classifyError(new Error("Gemini error: 503 overloaded")).class, "server_error");
  assert.equal(classifyError(new Error("bad configuration")).class, "validation");
});

// --- cron -------------------------------------------------------------------

test("cron: parsing and next run", () => {
  assert.ok("error" in parseCronExpression("bad"));
  assert.ok("error" in parseCronExpression("61 * * * *"));
  const every15 = parseCronExpression("*/15 * * * *");
  assert.ok(!("error" in every15));
  const next = nextCronRun(every15, new Date("2026-07-13T10:07:00Z"));
  assert.ok(next);
  assert.equal(next.getMinutes() % 15, 0);
  const daily = parseCronExpression("30 9 * * 1-5");
  assert.ok(!("error" in daily));
  const fire = nextCronRun(daily, new Date("2026-07-11T00:00:00")); // Saturday
  assert.ok(fire);
  assert.ok(fire.getDay() >= 1 && fire.getDay() <= 5);
  assert.equal(fire.getHours(), 9);
  assert.equal(fire.getMinutes(), 30);
});

// --- validation ---------------------------------------------------------------

const VALID_DEF: WorkflowDefinition = {
  inputs: [{ name: "topic" }],
  nodes: [
    { id: "draft", type: "llm", config: { prompt: "Write about {{inputs.topic}}" } },
    {
      id: "summary",
      type: "llm",
      config: { prompt: "Summarize: {{draft.text}}" },
    },
  ],
  edges: [{ from: "draft", to: "summary" }],
};

test("validation: accepts a valid graph", () => {
  const result = validateWorkflowDefinition(VALID_DEF);
  assert.deepEqual(result.errors, []);
  assert.ok(result.ok);
});

test("validation: rejects cycles, dangling edges, unknown refs", () => {
  const cycle = validateWorkflowDefinition({
    nodes: [
      { id: "a", type: "transform", config: { outputs: { x: "1" } } },
      { id: "b", type: "transform", config: { outputs: { x: "1" } } },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "a" },
    ],
  });
  assert.ok(cycle.errors.some((e) => e.includes("cycle")));

  const dangling = validateWorkflowDefinition({
    nodes: [{ id: "a", type: "transform", config: { outputs: { x: "1" } } }],
    edges: [{ from: "a", to: "ghost" }],
  });
  assert.ok(dangling.errors.some((e) => e.includes("unknown 'to'")));

  const badRef = validateWorkflowDefinition({
    nodes: [
      { id: "a", type: "llm", config: { prompt: "use {{b.text}}" } },
      { id: "b", type: "llm", config: { prompt: "hi" } },
    ],
    edges: [{ from: "a", to: "b" }],
  });
  assert.ok(badRef.errors.some((e) => e.includes("not a workflow input or an upstream node")));
});

test("validation: loop and branch config rules", () => {
  const badLoop = validateWorkflowDefinition({
    nodes: [
      {
        id: "l",
        type: "loop",
        config: {
          for_each: "inputs.items",
          max_iterations: 9999,
          body: { nodes: [{ id: "n", type: "transform", config: { outputs: { v: "item" } } }], edges: [] },
        },
      },
    ],
    edges: [],
  });
  assert.ok(badLoop.errors.some((e) => e.includes("max_iterations")));

  const badBranch = validateWorkflowDefinition({
    nodes: [{ id: "b", type: "branch", config: {} }],
    edges: [],
  });
  assert.ok(badBranch.errors.some((e) => e.includes("exactly one of expression or llm")));
});

// --- engine: sequential + data flow -----------------------------------------

test("engine: sequential LLM nodes pass outputs and record usage", async () => {
  const llm = fakeLlm((prompt) =>
    prompt.startsWith("Write") ? "draft-text" : `summary-of(${prompt})`,
  );
  const { persistence, run } = await executeRun(VALID_DEF, llm, { topic: "NDAs" });

  assert.equal(run.status, "succeeded");
  assert.deepEqual(llm.calls[0], "Write about NDAs");
  assert.equal(llm.calls[1], "Summarize: draft-text");
  const summary = nodeOutput(persistence, "summary") as { text: string };
  assert.equal(summary.text, "summary-of(Summarize: draft-text)");
  const row = [...persistence.nodeRuns.values()].find((r) => r.node_id === "draft")!;
  assert.equal(row.prompt_tokens, 10);
  assert.equal(row.completion_tokens, 5);
  assert.deepEqual(Object.keys(run.output ?? {}), ["summary"]);
});

// --- engine: branch + skip ----------------------------------------------------

test("engine: branch routes by label and skips the other side", async () => {
  const def: WorkflowDefinition = {
    nodes: [
      { id: "decide", type: "branch", config: { expression: "'yes'" } },
      { id: "onYes", type: "transform", config: { outputs: { v: "'took-yes'" } } },
      { id: "onNo", type: "transform", config: { outputs: { v: "'took-no'" } } },
    ],
    edges: [
      { from: "decide", to: "onYes", label: "yes" },
      { from: "decide", to: "onNo", label: "no" },
    ],
  };
  const { persistence, run } = await executeRun(def, fakeLlm(() => ""));
  assert.equal(run.status, "succeeded");
  assert.equal(nodeStatus(persistence, "onYes"), "succeeded");
  assert.equal(nodeStatus(persistence, "onNo"), "skipped");
});

// --- engine: retries ------------------------------------------------------------

test("engine: retries retryable failures with backoff, then succeeds", async () => {
  let attempts = 0;
  const llm = fakeLlm(() => {
    attempts++;
    if (attempts < 3) throw new Error("429 rate limit");
    return "ok";
  });
  const sleeps: number[] = [];
  const def: WorkflowDefinition = {
    nodes: [
      {
        id: "flaky",
        type: "llm",
        config: { prompt: "go" },
        retry: { max_attempts: 3, backoff_ms: 100 },
      },
    ],
    edges: [],
  };
  const persistence = new InMemoryEnginePersistence();
  const run = makeRun();
  persistence.seedRun(run, def);
  const executor = new RunExecutor(run, def, {
    persistence,
    llm,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  await executor.execute();

  const final = await persistence.getRun(run.id);
  assert.equal(final!.status, "succeeded");
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [100, 200]); // exponential backoff
  const row = [...persistence.nodeRuns.values()].find((r) => r.node_id === "flaky")!;
  assert.equal(row.attempt, 3);
});

test("engine: non-retryable failure fails the run", async () => {
  const llm = fakeLlm(() => {
    throw new Error("invalid configuration");
  });
  const def: WorkflowDefinition = {
    nodes: [
      { id: "a", type: "llm", config: { prompt: "go" }, retry: { max_attempts: 3 } },
    ],
    edges: [],
  };
  const { run } = await executeRun(def, llm);
  assert.equal(run.status, "failed");
  assert.equal(llm.calls.length, 1); // validation-class error: no retries
});

// --- engine: failure policies ----------------------------------------------------

test("engine: on_failure fallback routes the failure edge", async () => {
  const llm = fakeLlm((prompt) => {
    if (prompt === "primary") throw new Error("500 internal server error");
    return "recovered";
  });
  const def: WorkflowDefinition = {
    nodes: [
      {
        id: "primary",
        type: "llm",
        config: { prompt: "primary" },
        on_failure: "fallback",
      },
      { id: "rescue", type: "llm", config: { prompt: "rescue" } },
      { id: "happy", type: "llm", config: { prompt: "happy" } },
    ],
    edges: [
      { from: "primary", to: "happy" },
      { from: "primary", to: "rescue", on: "failure" },
    ],
  };
  const { persistence, run } = await executeRun(def, llm);
  assert.equal(run.status, "succeeded");
  assert.equal(nodeStatus(persistence, "primary"), "failed");
  assert.equal(nodeStatus(persistence, "rescue"), "succeeded");
  assert.equal(nodeStatus(persistence, "happy"), "skipped");
});

// --- engine: parallel + join --------------------------------------------------

test("engine: parallel fan-out joins all branch outputs", async () => {
  const llm = fakeLlm((prompt) => `out:${prompt}`);
  const def: WorkflowDefinition = {
    nodes: [
      { id: "fan", type: "parallel", config: {} },
      { id: "left", type: "llm", config: { prompt: "L" } },
      { id: "right", type: "llm", config: { prompt: "R" } },
      { id: "merge", type: "join", config: {} },
    ],
    edges: [
      { from: "fan", to: "left" },
      { from: "fan", to: "right" },
      { from: "left", to: "merge" },
      { from: "right", to: "merge" },
    ],
  };
  const { persistence, run } = await executeRun(def, llm);
  assert.equal(run.status, "succeeded");
  const merge = nodeOutput(persistence, "merge") as {
    values: Record<string, { text: string }>;
  };
  assert.equal(merge.values.left.text, "out:L");
  assert.equal(merge.values.right.text, "out:R");
});

// --- engine: loop ---------------------------------------------------------------

test("engine: for_each loop iterates and collects results", async () => {
  const llm = fakeLlm((prompt) => `reviewed(${prompt})`);
  const def: WorkflowDefinition = {
    inputs: [{ name: "docs" }],
    nodes: [
      {
        id: "each",
        type: "loop",
        config: {
          for_each: "inputs.docs",
          max_iterations: 10,
          body: {
            nodes: [{ id: "review", type: "llm", config: { prompt: "{{item}}" } }],
            edges: [],
          },
          result: "review.text",
        },
      },
    ],
    edges: [],
  };
  const { persistence, run } = await executeRun(def, llm, { docs: ["a", "b", "c"] });
  assert.equal(run.status, "succeeded");
  const out = nodeOutput(persistence, "each") as { results: string[] };
  assert.deepEqual(out.results, ["reviewed(a)", "reviewed(b)", "reviewed(c)"]);
  // Body node runs are namespaced per iteration.
  assert.equal(nodeStatus(persistence, "each#1.review"), "succeeded");
});

// --- engine: human-in-the-loop + resume -----------------------------------------

test("engine: human node pauses the run and resumes after input", async () => {
  const llm = fakeLlm(() => "drafted");
  const def: WorkflowDefinition = {
    nodes: [
      { id: "draft", type: "llm", config: { prompt: "draft it" } },
      {
        id: "approve",
        type: "human",
        config: { prompt: "Approve {{draft.text}}?", choices: ["approve", "reject"] },
      },
      {
        id: "after",
        type: "transform",
        config: { outputs: { decision: "approve.response.choice" } },
      },
    ],
    edges: [
      { from: "draft", to: "approve" },
      { from: "approve", to: "after" },
    ],
  };

  const persistence = new InMemoryEnginePersistence();
  const run = makeRun();
  persistence.seedRun(run, def);
  const deps: EngineDeps = { persistence, llm, sleep: async () => {} };

  await new RunExecutor(run, def, deps).execute();
  let state = await persistence.getRun(run.id);
  assert.equal(state!.status, "waiting");
  const humanRow = [...persistence.nodeRuns.values()].find((r) => r.node_id === "approve")!;
  assert.equal(humanRow.status, "waiting");
  assert.match((humanRow.input as { prompt: string }).prompt, /Approve drafted\?/);

  // Simulate the resume endpoint: provide the response, flip to running,
  // and re-execute — the succeeded nodes are reused, not re-run.
  await persistence.upsertNodeRun({
    ...humanRow,
    status: "succeeded",
    output: { response: { choice: "approve" } },
    finished_at: new Date().toISOString(),
  });
  assert.ok(await persistence.claimRun(run.id));
  const resumed = (await persistence.getRun(run.id))!;
  await new RunExecutor(resumed, def, deps).execute();

  state = await persistence.getRun(run.id);
  assert.equal(state!.status, "succeeded");
  assert.equal(llm.calls.length, 1); // draft was not re-executed
  const after = nodeOutput(persistence, "after") as { decision: string };
  assert.equal(after.decision, "approve");
});

// --- engine: cancellation --------------------------------------------------------

test("engine: cancel aborts an in-flight run", async () => {
  let release: (() => void) | null = null;
  const llm: EngineLlm = {
    resolveNodeModel: () => ({ model: "gemini-3-flash-preview" }),
    complete: () =>
      new Promise((resolve) => {
        release = () => resolve({ text: "late", usage: null });
      }),
  };
  const def: WorkflowDefinition = {
    nodes: [{ id: "slow", type: "llm", config: { prompt: "slow" } }],
    edges: [],
  };
  const persistence = new InMemoryEnginePersistence();
  const run = makeRun();
  persistence.seedRun(run, def);
  const executor = new RunExecutor(run, def, { persistence, llm, sleep: async () => {} });
  const done = executor.execute();
  await new Promise((r) => setTimeout(r, 20));
  executor.cancel();
  await done;
  release?.();

  const state = await persistence.getRun(run.id);
  assert.equal(state!.status, "canceled");
});

// --- engine: crash recovery / idempotency ---------------------------------------

test("engine: re-execution reuses succeeded nodes (idempotent restart)", async () => {
  const llm = fakeLlm((prompt) => `v:${prompt}`);
  const persistence = new InMemoryEnginePersistence();
  const run = makeRun({ topic: "x" });
  persistence.seedRun(run, VALID_DEF);
  // Simulate a crash after the first node succeeded.
  await persistence.upsertNodeRun({
    run_id: run.id,
    node_id: "draft",
    iteration_key: "",
    attempt: 1,
    status: "succeeded",
    input: null,
    output: { text: "pre-crash-draft" },
    error: null,
    idempotency_key: null,
    model: null,
    prompt_tokens: null,
    completion_tokens: null,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });

  await new RunExecutor(run, VALID_DEF, {
    persistence,
    llm,
    sleep: async () => {},
  }).execute();

  const state = await persistence.getRun(run.id);
  assert.equal(state!.status, "succeeded");
  assert.equal(llm.calls.length, 1);
  assert.equal(llm.calls[0], "Summarize: pre-crash-draft");
});

// --- engine: integration — multi-node with failure + retry ----------------------

test("integration: branch -> parallel analysis -> join, with a flaky node retrying", async () => {
  let flaky = 0;
  const llm = fakeLlm((prompt) => {
    if (prompt.startsWith("classify")) return "contract";
    if (prompt.startsWith("risks")) {
      flaky++;
      if (flaky === 1) throw new Error("503 service unavailable");
      return "risk-list";
    }
    if (prompt.startsWith("dates")) return "date-list";
    return `final(${prompt})`;
  });
  const def: WorkflowDefinition = {
    inputs: [{ name: "doc" }],
    nodes: [
      {
        id: "classify",
        type: "branch",
        config: { llm: { prompt: "classify {{inputs.doc}}", choices: ["contract", "judgment"] } },
      },
      { id: "risks", type: "llm", config: { prompt: "risks {{inputs.doc}}" }, retry: { max_attempts: 2, backoff_ms: 10 } },
      { id: "dates", type: "llm", config: { prompt: "dates {{inputs.doc}}" } },
      { id: "merge", type: "join", config: {} },
      {
        id: "report",
        type: "llm",
        config: { prompt: "report {{merge.values.risks.text}} + {{merge.values.dates.text}}" },
      },
    ],
    edges: [
      { from: "classify", to: "risks", label: "contract" },
      { from: "classify", to: "dates", label: "contract" },
      { from: "risks", to: "merge" },
      { from: "dates", to: "merge" },
      { from: "merge", to: "report" },
    ],
  };
  const { persistence, run } = await executeRun(def, llm, { doc: "nda.pdf" });
  assert.equal(run.status, "succeeded");
  assert.equal(flaky, 2); // failed once, retried once
  const report = nodeOutput(persistence, "report") as { text: string };
  assert.equal(report.text, "final(report risk-list + date-list)");
});
