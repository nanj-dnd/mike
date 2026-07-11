/**
 * Indian-law eval runner.
 *
 * Sends each case in indian-law-evals.json to the chat model under the
 * production system prompt and scores the answer on keyword presence
 * (must_mention) and absence (must_not_mention). Deliberately simple: the
 * goal is regression detection when prompts or models change, not a
 * benchmark.
 *
 * Usage:
 *   EVAL_API_KEY=<gemini key> npm run evals            # all cases
 *   EVAL_API_KEY=<key> npm run evals -- cheque         # cases matching "cheque"
 *
 * Falls back to GEMINI_API_KEY when EVAL_API_KEY is unset. Costs a few
 * paise per case on Gemini Flash; runs only when invoked manually.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { completeText } from "../src/lib/llm";
import { buildSystemPrompt } from "../src/lib/chat/prompts";

type EvalCase = {
    id: string;
    question: string;
    must_mention: string[];
    must_not_mention: string[];
    note?: string;
};

const MODEL = process.env.EVAL_MODEL || "gemini-3-flash-preview";

async function main() {
    const apiKey =
        process.env.EVAL_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
        console.error(
            "Set EVAL_API_KEY (or GEMINI_API_KEY) to run evals — the runner calls the LLM directly.",
        );
        process.exit(1);
    }

    const filter = process.argv[2]?.toLowerCase();
    const { cases } = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, "indian-law-evals.json"),
            "utf8",
        ),
    ) as { cases: EvalCase[] };
    const selected = filter
        ? cases.filter((c) => c.id.toLowerCase().includes(filter))
        : cases;

    const systemPrompt = buildSystemPrompt(false, false);
    let passed = 0;
    const failures: { id: string; reasons: string[] }[] = [];

    for (const c of selected) {
        let answer = "";
        try {
            answer = await completeText({
                model: MODEL,
                systemPrompt,
                user: c.question,
                maxTokens: 1024,
                apiKeys: { gemini: apiKey },
            });
        } catch (err) {
            failures.push({
                id: c.id,
                reasons: [
                    `LLM call failed: ${err instanceof Error ? err.message : err}`,
                ],
            });
            console.log(`✗ ${c.id} (call failed)`);
            continue;
        }

        const lower = answer.toLowerCase();
        const reasons: string[] = [];
        for (const term of c.must_mention) {
            if (!lower.includes(term.toLowerCase()))
                reasons.push(`missing: "${term}"`);
        }
        for (const term of c.must_not_mention) {
            if (lower.includes(term.toLowerCase()))
                reasons.push(`must not mention: "${term}"`);
        }

        if (reasons.length === 0) {
            passed++;
            console.log(`✓ ${c.id}`);
        } else {
            failures.push({ id: c.id, reasons });
            console.log(`✗ ${c.id} — ${reasons.join("; ")}`);
        }
    }

    console.log(
        `\n${passed}/${selected.length} passed (model: ${MODEL})`,
    );
    for (const f of failures) {
        console.log(`  FAIL ${f.id}: ${f.reasons.join("; ")}`);
    }
    process.exit(failures.length > 0 ? 1 : 0);
}

main();
