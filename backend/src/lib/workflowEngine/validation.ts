// Definition validation: structural checks, per-node config checks,
// cycle rejection (cycles are only expressible via loop-node bodies),
// dangling-edge detection, and reference checking (every {{ref}} must
// point at workflow inputs, loop scope, or an ancestor node's outputs).

import {
  checkExpression,
  collectReferenceRoots,
} from "./expressions";
import type {
  BranchNodeConfig,
  EdgeDef,
  HumanNodeConfig,
  LlmNodeConfig,
  LoopNodeConfig,
  NodeDef,
  TransformNodeConfig,
  WorkflowDefinition,
} from "./types";

const NODE_TYPES = new Set([
  "llm",
  "transform",
  "branch",
  "parallel",
  "join",
  "loop",
  "human",
]);

const NODE_ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const RESERVED_IDS = new Set(["inputs", "item", "loop", "run", "true", "false", "null"]);
const MAX_NODES = 100;
const MAX_LOOP_ITERATIONS = 200;
export const MAX_RUN_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateWorkflowDefinition(def: unknown): ValidationResult {
  const errors: string[] = [];
  validateGraph(def, "", ["inputs"], errors, 0);
  return { ok: errors.length === 0, errors };
}

function validateGraph(
  def: unknown,
  where: string,
  scopeRoots: string[],
  errors: string[],
  depth: number,
): void {
  const at = (msg: string) => errors.push(where ? `${where}: ${msg}` : msg);

  if (!def || typeof def !== "object" || Array.isArray(def)) {
    at("definition must be an object");
    return;
  }
  if (depth > 3) {
    at("loop bodies may nest at most 3 levels deep");
    return;
  }
  const d = def as Partial<WorkflowDefinition> & Record<string, unknown>;

  if (!Array.isArray(d.nodes) || d.nodes.length === 0) {
    at("nodes must be a non-empty array");
    return;
  }
  if (d.nodes.length > MAX_NODES) at(`too many nodes (max ${MAX_NODES})`);
  if (!Array.isArray(d.edges)) {
    at("edges must be an array");
    return;
  }
  if (
    d.run_timeout_ms !== undefined &&
    (typeof d.run_timeout_ms !== "number" ||
      d.run_timeout_ms <= 0 ||
      d.run_timeout_ms > MAX_RUN_TIMEOUT_MS)
  ) {
    at(`run_timeout_ms must be a positive number up to ${MAX_RUN_TIMEOUT_MS}`);
  }

  if (d.inputs !== undefined) {
    if (!Array.isArray(d.inputs)) {
      at("inputs must be an array");
    } else {
      for (const input of d.inputs) {
        if (!input || typeof input !== "object" || typeof (input as { name?: unknown }).name !== "string") {
          at("every workflow input needs a string name");
        }
      }
    }
  }

  // --- Nodes ---
  const ids = new Set<string>();
  for (const node of d.nodes as unknown[]) {
    if (!node || typeof node !== "object") {
      at("every node must be an object");
      continue;
    }
    const n = node as Partial<NodeDef>;
    if (typeof n.id !== "string" || !NODE_ID_RE.test(n.id)) {
      at(`invalid node id: ${JSON.stringify(n.id ?? null)}`);
      continue;
    }
    if (RESERVED_IDS.has(n.id)) at(`node id '${n.id}' is reserved`);
    if (ids.has(n.id)) at(`duplicate node id: ${n.id}`);
    ids.add(n.id);
    if (typeof n.type !== "string" || !NODE_TYPES.has(n.type)) {
      at(`node ${n.id}: unknown type '${String(n.type)}'`);
      continue;
    }
    if (!n.config || typeof n.config !== "object" || Array.isArray(n.config)) {
      at(`node ${n.id}: config must be an object`);
      continue;
    }
    validateNodePolicies(n as NodeDef, at);
    validateNodeConfig(n as NodeDef, `${where}${where ? ": " : ""}node ${n.id}`, scopeRoots, errors, depth);
  }
  if (errors.length > 0 && ids.size !== (d.nodes as unknown[]).length) return;

  // --- Edges ---
  const nodeById = new Map((d.nodes as NodeDef[]).map((n) => [n.id, n]));
  for (const edge of d.edges as unknown[]) {
    if (!edge || typeof edge !== "object") {
      at("every edge must be an object");
      continue;
    }
    const e = edge as Partial<EdgeDef>;
    if (typeof e.from !== "string" || !ids.has(e.from)) {
      at(`edge references unknown 'from' node: ${String(e.from)}`);
      continue;
    }
    if (typeof e.to !== "string" || !ids.has(e.to)) {
      at(`edge references unknown 'to' node: ${String(e.to)}`);
      continue;
    }
    if (e.from === e.to) at(`edge ${e.from} -> ${e.to}: self-edges are not allowed`);
    if (e.on !== undefined && e.on !== "success" && e.on !== "failure") {
      at(`edge ${e.from} -> ${e.to}: on must be "success" or "failure"`);
    }
    if (e.condition !== undefined) {
      if (typeof e.condition !== "string") {
        at(`edge ${e.from} -> ${e.to}: condition must be a string`);
      } else {
        const check = checkExpression(e.condition);
        if (!check.ok) at(`edge ${e.from} -> ${e.to}: bad condition: ${check.error}`);
      }
    }
    if (e.label !== undefined && typeof e.label !== "string") {
      at(`edge ${e.from} -> ${e.to}: label must be a string`);
    }
    if (e.label !== undefined && nodeById.get(e.from)?.type !== "branch") {
      at(`edge ${e.from} -> ${e.to}: label shorthand is only valid from branch nodes`);
    }
  }

  // --- Cycles (DFS) ---
  const adjacency = new Map<string, string[]>();
  for (const id of ids) adjacency.set(id, []);
  for (const e of d.edges as EdgeDef[]) {
    if (ids.has(e.from) && ids.has(e.to)) adjacency.get(e.from)!.push(e.to);
  }
  const color = new Map<string, 0 | 1 | 2>();
  const cycleAt = (start: string): boolean => {
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }];
    color.set(start, 1);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const targets = adjacency.get(frame.id)!;
      if (frame.next < targets.length) {
        const target = targets[frame.next++];
        const c = color.get(target) ?? 0;
        if (c === 1) return true;
        if (c === 0) {
          color.set(target, 1);
          stack.push({ id: target, next: 0 });
        }
      } else {
        color.set(frame.id, 2);
        stack.pop();
      }
    }
    return false;
  };
  for (const id of ids) {
    if ((color.get(id) ?? 0) === 0 && cycleAt(id)) {
      at("graph contains a cycle — use a loop node for iteration");
      break;
    }
  }

  // --- Entry + reachability ---
  const hasIncoming = new Set((d.edges as EdgeDef[]).map((e) => e.to));
  const entries = [...ids].filter((id) => !hasIncoming.has(id));
  if (entries.length === 0) at("no entry node (every node has incoming edges)");
  const reachable = new Set<string>(entries);
  const queue = [...entries];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const next of adjacency.get(id) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  for (const id of ids) {
    if (!reachable.has(id)) at(`node ${id} is unreachable from any entry node`);
  }

  // --- Reference roots must be inputs, scope, or ancestor nodes ---
  if (errors.length === 0) {
    const ancestors = computeAncestors(ids, d.edges as EdgeDef[]);
    for (const node of d.nodes as NodeDef[]) {
      const allowed = new Set([...scopeRoots, ...(ancestors.get(node.id) ?? new Set<string>())]);
      for (const root of collectNodeReferenceRoots(node)) {
        if (!allowed.has(root)) {
          at(
            `node ${node.id} references '${root}', which is not a workflow input or an upstream node`,
          );
        }
      }
    }
    for (const e of d.edges as EdgeDef[]) {
      if (typeof e.condition !== "string") continue;
      const allowed = new Set([
        ...scopeRoots,
        e.from,
        ...(ancestors.get(e.from) ?? new Set<string>()),
      ]);
      for (const root of collectReferenceRoots(e.condition, false)) {
        if (!allowed.has(root)) {
          at(`edge ${e.from} -> ${e.to} condition references '${root}', which is not upstream`);
        }
      }
    }
  }
}

function validateNodePolicies(n: NodeDef, at: (msg: string) => void): void {
  if (n.retry !== undefined) {
    const r = n.retry;
    if (typeof r !== "object" || r === null) at(`node ${n.id}: retry must be an object`);
    else {
      if (
        r.max_attempts !== undefined &&
        (typeof r.max_attempts !== "number" || r.max_attempts < 1 || r.max_attempts > 5)
      ) {
        at(`node ${n.id}: retry.max_attempts must be 1..5`);
      }
      if (
        r.backoff_ms !== undefined &&
        (typeof r.backoff_ms !== "number" || r.backoff_ms < 0 || r.backoff_ms > 60_000)
      ) {
        at(`node ${n.id}: retry.backoff_ms must be 0..60000`);
      }
      if (r.retry_on !== undefined) {
        const valid = new Set(["rate_limit", "timeout", "server_error", "validation"]);
        if (!Array.isArray(r.retry_on) || r.retry_on.some((c) => !valid.has(String(c)))) {
          at(`node ${n.id}: retry.retry_on entries must be error classes`);
        }
      }
    }
  }
  if (
    n.timeout_ms !== undefined &&
    (typeof n.timeout_ms !== "number" || n.timeout_ms <= 0 || n.timeout_ms > 60 * 60 * 1000)
  ) {
    at(`node ${n.id}: timeout_ms must be a positive number up to 1 hour`);
  }
  if (
    n.on_failure !== undefined &&
    !["fail", "continue", "fallback"].includes(n.on_failure)
  ) {
    at(`node ${n.id}: on_failure must be fail, continue, or fallback`);
  }
}

function validateNodeConfig(
  n: NodeDef,
  where: string,
  scopeRoots: string[],
  errors: string[],
  depth: number,
): void {
  const at = (msg: string) => errors.push(`${where}: ${msg}`);
  const config = n.config as Record<string, unknown>;

  switch (n.type) {
    case "llm": {
      const c = config as Partial<LlmNodeConfig>;
      if (typeof c.prompt !== "string" || !c.prompt.trim()) at("llm nodes need a prompt");
      if (c.model_tier !== undefined && c.model_tier !== "low" && c.model_tier !== "mid") {
        at('model_tier must be "low" or "mid"');
      }
      if (c.output !== undefined && c.output !== "text" && c.output !== "json") {
        at('output must be "text" or "json"');
      }
      if (
        c.max_tokens !== undefined &&
        (typeof c.max_tokens !== "number" || c.max_tokens < 1 || c.max_tokens > 64_000)
      ) {
        at("max_tokens must be 1..64000");
      }
      break;
    }
    case "transform": {
      const c = config as Partial<TransformNodeConfig>;
      if (!c.outputs || typeof c.outputs !== "object" || Array.isArray(c.outputs)) {
        at("transform nodes need an outputs object of expressions");
        break;
      }
      const entries = Object.entries(c.outputs);
      if (entries.length === 0) at("transform outputs must not be empty");
      for (const [name, expr] of entries) {
        if (!NODE_ID_RE.test(name)) at(`bad output name: ${name}`);
        if (typeof expr !== "string") {
          at(`output ${name} must be an expression string`);
          continue;
        }
        const check = checkExpression(expr);
        if (!check.ok) at(`output ${name}: ${check.error}`);
      }
      break;
    }
    case "branch": {
      const c = config as Partial<BranchNodeConfig>;
      const hasExpr = typeof c.expression === "string" && c.expression.trim() !== "";
      const hasLlm = !!c.llm;
      if (hasExpr === hasLlm) {
        at("branch nodes need exactly one of expression or llm");
        break;
      }
      if (hasExpr) {
        const check = checkExpression(c.expression as string);
        if (!check.ok) at(`bad expression: ${check.error}`);
      } else if (c.llm) {
        if (typeof c.llm.prompt !== "string" || !c.llm.prompt.trim()) {
          at("branch llm needs a prompt");
        }
        if (
          !Array.isArray(c.llm.choices) ||
          c.llm.choices.length < 2 ||
          c.llm.choices.some((choice) => typeof choice !== "string" || !choice.trim())
        ) {
          at("branch llm needs at least 2 string choices");
        }
      }
      break;
    }
    case "loop": {
      const c = config as Partial<LoopNodeConfig>;
      const hasForEach = typeof c.for_each === "string" && c.for_each.trim() !== "";
      const hasWhile = typeof c.while === "string" && c.while.trim() !== "";
      if (hasForEach === hasWhile) {
        at("loop nodes need exactly one of for_each or while");
      }
      if (
        typeof c.max_iterations !== "number" ||
        c.max_iterations < 1 ||
        c.max_iterations > MAX_LOOP_ITERATIONS
      ) {
        at(`max_iterations must be 1..${MAX_LOOP_ITERATIONS}`);
      }
      if (c.mode !== undefined && c.mode !== "sequential" && c.mode !== "parallel") {
        at('mode must be "sequential" or "parallel"');
      }
      if (c.mode === "parallel" && hasWhile) at("while loops must be sequential");
      for (const src of [c.for_each, c.while, c.result]) {
        if (typeof src === "string" && src.trim()) {
          const check = checkExpression(src);
          if (!check.ok) at(`bad expression: ${check.error}`);
        }
      }
      if (!c.body) {
        at("loop nodes need a body definition");
      } else {
        // Body scope adds the loop variables; body nodes may also
        // reference the outer scope (inputs + outer ancestors are NOT
        // included by design — pass data in via for_each/items).
        validateGraph(
          c.body,
          `${where} body`,
          [...scopeRoots, "item", "loop"],
          errors,
          depth + 1,
        );
      }
      break;
    }
    case "human": {
      const c = config as Partial<HumanNodeConfig>;
      if (typeof c.prompt !== "string" || !c.prompt.trim()) at("human nodes need a prompt");
      if (
        c.choices !== undefined &&
        (!Array.isArray(c.choices) || c.choices.some((choice) => typeof choice !== "string"))
      ) {
        at("choices must be an array of strings");
      }
      break;
    }
    case "parallel":
    case "join":
      break;
  }
}

/** First output segment each node type exposes, for reference messages. */
export function nodeOutputNames(node: NodeDef): string[] {
  switch (node.type) {
    case "llm":
      return ["text", "json"];
    case "transform":
      return Object.keys((node.config as Partial<TransformNodeConfig>).outputs ?? {});
    case "branch":
      return ["value"];
    case "human":
      return ["response"];
    case "join":
      return ["values"];
    case "loop":
      return ["results"];
    case "parallel":
      return [];
  }
}

function collectNodeReferenceRoots(node: NodeDef): string[] {
  const roots = new Set<string>();
  const visit = (value: unknown, template: boolean) => {
    if (typeof value === "string") {
      for (const root of collectReferenceRoots(value, template)) roots.add(root);
    } else if (Array.isArray(value)) {
      for (const v of value) visit(v, template);
    } else if (value && typeof value === "object") {
      for (const v of Object.values(value)) visit(v, template);
    }
  };
  const config = node.config as Record<string, unknown>;
  if (node.type === "llm" || node.type === "human") {
    visit(config, true);
  } else if (node.type === "transform") {
    for (const expr of Object.values((config as Partial<TransformNodeConfig>).outputs ?? {})) {
      if (typeof expr === "string") visit(expr, false);
    }
  } else if (node.type === "branch") {
    const c = config as BranchNodeConfig;
    if (c.expression) visit(c.expression, false);
    if (c.llm?.prompt) visit(c.llm.prompt, true);
  } else if (node.type === "loop") {
    const c = config as Partial<LoopNodeConfig>;
    if (c.for_each) visit(c.for_each, false);
    if (c.while) visit(c.while, false);
    // body refs are validated recursively in their own scope; result runs
    // in body scope too.
  }
  roots.delete("item");
  roots.delete("loop");
  return [...roots];
}

function computeAncestors(
  ids: Set<string>,
  edges: EdgeDef[],
): Map<string, Set<string>> {
  const incoming = new Map<string, string[]>();
  for (const id of ids) incoming.set(id, []);
  for (const e of edges) {
    if (ids.has(e.from) && ids.has(e.to)) incoming.get(e.to)!.push(e.from);
  }
  const cache = new Map<string, Set<string>>();
  const visit = (id: string, seen: Set<string>): Set<string> => {
    const cached = cache.get(id);
    if (cached) return cached;
    if (seen.has(id)) return new Set(); // cycle — reported elsewhere
    seen.add(id);
    const result = new Set<string>();
    for (const parent of incoming.get(id) ?? []) {
      result.add(parent);
      for (const a of visit(parent, seen)) result.add(a);
    }
    cache.set(id, result);
    return result;
  };
  for (const id of ids) visit(id, new Set());
  return cache;
}
