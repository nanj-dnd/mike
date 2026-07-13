// Safe expression interpreter for workflow definitions. No eval, no
// prototype access — a small recursive-descent parser over a fixed
// grammar, evaluated against the run context.
//
// Grammar (precedence low->high):
//   or:      and ("||" and)*
//   and:     equality ("&&" equality)*
//   equality: compare (("=="|"!=") compare)*
//   compare: additive (("<"|"<="|">"|">=") additive)*
//   additive: term (("+"|"-") term)*
//   term:    unary (("*"|"/"|"%") unary)*
//   unary:   ("!"|"-") unary | primary
//   primary: literal | path | call | "(" or ")"
//   path:    ident ("." ident | "[" number "]" | "[" string "]")*
//
// Path roots resolve through the resolver: workflow inputs ("inputs.x"),
// upstream node outputs ("nodeId.text"), and loop scope ("item",
// "loop.index"). {{ expr }} in templates uses the same grammar.

export type ExprValue = unknown;
export type PathResolver = (root: string, path: (string | number)[]) => ExprValue;

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionError";
  }
}

type Token =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "ident"; value: string }
  | { kind: "op"; value: string };

const OPS = [
  "||",
  "&&",
  "==",
  "!=",
  "<=",
  ">=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "!",
  "(",
  ")",
  "[",
  "]",
  ".",
  ",",
];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let out = "";
      while (j < src.length && src[j] !== ch) {
        if (src[j] === "\\" && j + 1 < src.length) {
          out += src[j + 1];
          j += 2;
        } else {
          out += src[j];
          j++;
        }
      }
      if (j >= src.length) throw new ExpressionError("Unterminated string");
      tokens.push({ kind: "str", value: out });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const match = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i));
      if (!match) throw new ExpressionError("Bad number");
      tokens.push({ kind: "num", value: Number(match[0]) });
      i += match[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(src.slice(i));
      if (!match) throw new ExpressionError("Bad identifier");
      tokens.push({ kind: "ident", value: match[0] });
      i += match[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS.includes(two)) {
      tokens.push({ kind: "op", value: two });
      i += 2;
      continue;
    }
    if (OPS.includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }
    throw new ExpressionError(`Unexpected character: ${ch}`);
  }
  return tokens;
}

const FUNCTIONS: Record<string, (args: ExprValue[]) => ExprValue> = {
  len: ([x]) => {
    if (typeof x === "string" || Array.isArray(x)) return x.length;
    if (x && typeof x === "object") return Object.keys(x).length;
    return 0;
  },
  lower: ([s]) => String(s ?? "").toLowerCase(),
  upper: ([s]) => String(s ?? "").toUpperCase(),
  trim: ([s]) => String(s ?? "").trim(),
  contains: ([hay, needle]) => {
    if (Array.isArray(hay)) return hay.some((v) => looseEquals(v, needle));
    return String(hay ?? "").includes(String(needle ?? ""));
  },
  starts_with: ([s, p]) => String(s ?? "").startsWith(String(p ?? "")),
  ends_with: ([s, p]) => String(s ?? "").endsWith(String(p ?? "")),
  json_parse: ([s]) => {
    try {
      return JSON.parse(String(s ?? "null"));
    } catch {
      throw new ExpressionError("json_parse: invalid JSON");
    }
  },
  json_stringify: ([x]) => JSON.stringify(x ?? null),
  default: ([x, fallback]) => (x === null || x === undefined || x === "" ? fallback : x),
  number: ([x]) => {
    const n = Number(x);
    if (Number.isNaN(n)) throw new ExpressionError(`number(): not numeric: ${String(x)}`);
    return n;
  },
  string: ([x]) => stringifyValue(x),
  first: ([arr]) => (Array.isArray(arr) ? arr[0] : undefined),
  last: ([arr]) => (Array.isArray(arr) ? arr[arr.length - 1] : undefined),
  keys: ([obj]) => (obj && typeof obj === "object" ? Object.keys(obj) : []),
  join: ([arr, sep]) =>
    Array.isArray(arr) ? arr.map((v) => stringifyValue(v)).join(String(sep ?? ",")) : "",
  split: ([s, sep]) => String(s ?? "").split(String(sep ?? ",")),
};

const KEYWORDS: Record<string, ExprValue> = {
  true: true,
  false: false,
  null: null,
};

function looseEquals(a: ExprValue, b: ExprValue): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  return a === b;
}

class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private resolver: PathResolver,
  ) {}

  parse(): ExprValue {
    const value = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new ExpressionError("Unexpected trailing input");
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private takeOp(...values: string[]): string | null {
    const t = this.peek();
    if (t?.kind === "op" && values.includes(t.value)) {
      this.pos++;
      return t.value;
    }
    return null;
  }

  private parseOr(): ExprValue {
    let left = this.parseAnd();
    while (this.takeOp("||")) {
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  private parseAnd(): ExprValue {
    let left = this.parseEquality();
    while (this.takeOp("&&")) {
      const right = this.parseEquality();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  private parseEquality(): ExprValue {
    let left = this.parseCompare();
    let op: string | null;
    while ((op = this.takeOp("==", "!="))) {
      const right = this.parseCompare();
      const eq = looseEquals(left, right);
      left = op === "==" ? eq : !eq;
    }
    return left;
  }

  private parseCompare(): ExprValue {
    let left = this.parseAdditive();
    let op: string | null;
    while ((op = this.takeOp("<", "<=", ">", ">="))) {
      const right = this.parseAdditive();
      const l = Number(left);
      const r = Number(right);
      if (Number.isNaN(l) || Number.isNaN(r)) {
        throw new ExpressionError(`Comparison needs numbers: ${String(left)} ${op} ${String(right)}`);
      }
      left = op === "<" ? l < r : op === "<=" ? l <= r : op === ">" ? l > r : l >= r;
    }
    return left;
  }

  private parseAdditive(): ExprValue {
    let left = this.parseTerm();
    let op: string | null;
    while ((op = this.takeOp("+", "-"))) {
      const right = this.parseTerm();
      if (op === "+") {
        if (typeof left === "string" || typeof right === "string") {
          left = stringifyValue(left) + stringifyValue(right);
        } else {
          left = Number(left) + Number(right);
        }
      } else {
        left = Number(left) - Number(right);
      }
    }
    return left;
  }

  private parseTerm(): ExprValue {
    let left = this.parseUnary();
    let op: string | null;
    while ((op = this.takeOp("*", "/", "%"))) {
      const right = this.parseUnary();
      const l = Number(left);
      const r = Number(right);
      left = op === "*" ? l * r : op === "/" ? l / r : l % r;
    }
    return left;
  }

  private parseUnary(): ExprValue {
    if (this.takeOp("!")) return !this.parseUnary();
    if (this.takeOp("-")) return -Number(this.parseUnary());
    return this.parsePrimary();
  }

  private parsePrimary(): ExprValue {
    const t = this.peek();
    if (!t) throw new ExpressionError("Unexpected end of expression");
    if (t.kind === "num" || t.kind === "str") {
      this.pos++;
      return t.value;
    }
    if (this.takeOp("(")) {
      const inner = this.parseOr();
      if (!this.takeOp(")")) throw new ExpressionError("Expected )");
      return inner;
    }
    if (t.kind === "ident") {
      this.pos++;
      if (t.value in KEYWORDS) return KEYWORDS[t.value];
      // Function call
      if (this.peek()?.kind === "op" && this.peek()?.value === "(" && t.value in FUNCTIONS) {
        this.takeOp("(");
        const args: ExprValue[] = [];
        if (!(this.peek()?.kind === "op" && this.peek()?.value === ")")) {
          do {
            args.push(this.parseOr());
          } while (this.takeOp(","));
        }
        if (!this.takeOp(")")) throw new ExpressionError("Expected ) after arguments");
        return FUNCTIONS[t.value](args);
      }
      // Path
      const path: (string | number)[] = [];
      for (;;) {
        if (this.takeOp(".")) {
          const seg = this.peek();
          if (seg?.kind !== "ident") throw new ExpressionError("Expected property name after .");
          this.pos++;
          path.push(seg.value);
          continue;
        }
        if (this.takeOp("[")) {
          const seg = this.peek();
          if (seg?.kind === "num" || seg?.kind === "str") {
            this.pos++;
            path.push(seg.value);
          } else {
            throw new ExpressionError("Expected index or key in []");
          }
          if (!this.takeOp("]")) throw new ExpressionError("Expected ]");
          continue;
        }
        break;
      }
      return this.resolver(t.value, path);
    }
    throw new ExpressionError(`Unexpected token: ${String(t.value)}`);
  }
}

/** Evaluate a full expression string against the resolver. */
export function evaluateExpression(src: string, resolver: PathResolver): ExprValue {
  const trimmed = src.trim();
  // Allow the {{ expr }} form for single-expression strings.
  const unwrapped = unwrapSingleRef(trimmed) ?? trimmed;
  return new Parser(tokenize(unwrapped), resolver).parse();
}

/** Parse-check an expression without evaluating (validation). */
export function checkExpression(src: string): { ok: true } | { ok: false; error: string } {
  try {
    const trimmed = src.trim();
    const unwrapped = unwrapSingleRef(trimmed) ?? trimmed;
    // Resolver that records nothing; evaluation may still throw on
    // type errors, so only tokenize+parse structure is checked here.
    new Parser(tokenize(unwrapped), () => null).parse();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Collect the root identifiers referenced by an expression or template. */
export function collectReferenceRoots(src: string, template: boolean): string[] {
  const roots = new Set<string>();
  const record: PathResolver = (root) => {
    roots.add(root);
    return null;
  };
  try {
    if (template) {
      interpolateTemplate(src, record);
    } else {
      evaluateExpression(src, record);
    }
  } catch {
    // Structural errors are reported by checkExpression; references
    // gathered so far are still useful.
  }
  return [...roots];
}

function unwrapSingleRef(src: string): string | null {
  if (!src.startsWith("{{") || !src.endsWith("}}")) return null;
  const inner = src.slice(2, -2);
  if (inner.includes("{{") || inner.includes("}}")) return null;
  return inner;
}

export function stringifyValue(value: ExprValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Replace every {{ expr }} in a template with its evaluated value. */
export function interpolateTemplate(template: string, resolver: PathResolver): string {
  return template.replace(/\{\{([^{}]+)\}\}/g, (_m, expr: string) =>
    stringifyValue(new Parser(tokenize(expr.trim()), resolver).parse()),
  );
}

/**
 * Resolve a config value: a string that is exactly one {{ref}} returns
 * the raw value (arrays/objects survive); other strings interpolate;
 * arrays/objects resolve recursively.
 */
export function resolveConfigValue(value: unknown, resolver: PathResolver): unknown {
  if (typeof value === "string") {
    const single = unwrapSingleRef(value.trim());
    if (single !== null) {
      return new Parser(tokenize(single), resolver).parse();
    }
    return interpolateTemplate(value, resolver);
  }
  if (Array.isArray(value)) return value.map((v) => resolveConfigValue(v, resolver));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveConfigValue(v, resolver);
    return out;
  }
  return value;
}

const BLOCKED_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/** Walk a path into a value without touching prototypes. */
export function walkPath(value: ExprValue, path: (string | number)[]): ExprValue {
  let current = value;
  for (const seg of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof seg === "string" && BLOCKED_SEGMENTS.has(seg)) return undefined;
    if (Array.isArray(current)) {
      const idx = typeof seg === "number" ? seg : Number(seg);
      if (Number.isNaN(idx)) return undefined;
      current = current[idx];
      continue;
    }
    if (typeof current === "object") {
      if (!Object.prototype.hasOwnProperty.call(current, seg)) return undefined;
      current = (current as Record<string, unknown>)[String(seg)];
      continue;
    }
    return undefined;
  }
  return current;
}
