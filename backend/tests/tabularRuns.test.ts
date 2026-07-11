import { test } from "node:test";
import assert from "node:assert/strict";
import {
    attachOrStartRun,
    isRunActive,
    mapWithConcurrency,
    sleep,
} from "../src/lib/tabularRuns";

test("mapWithConcurrency processes every item with bounded parallelism", async () => {
    const seen: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await sleep(5);
        seen.push(n);
        inFlight--;
    });
    assert.equal(seen.length, 7);
    assert.ok(maxInFlight <= 3, `max in flight was ${maxInFlight}`);
    assert.ok(maxInFlight >= 2, "expected some parallelism");
});

test("a second attach joins the in-flight run instead of starting a new one", async () => {
    let starts = 0;
    const eventsA: unknown[] = [];
    const eventsB: unknown[] = [];
    let releaseRun!: () => void;
    const gate = new Promise<void>((resolve) => (releaseRun = resolve));

    const start = async (emit: (e: Record<string, unknown>) => void) => {
        starts++;
        emit({ step: 1 });
        await gate;
        emit({ step: 2 });
    };

    const first = attachOrStartRun("review-1", (e) => eventsA.push(e), start);
    assert.equal(first.attachedToExisting, false);
    assert.equal(isRunActive("review-1"), true);

    const second = attachOrStartRun("review-1", (e) => eventsB.push(e), start);
    assert.equal(second.attachedToExisting, true);
    assert.equal(starts, 1);

    releaseRun();
    await first.done;
    assert.equal(isRunActive("review-1"), false);
    // Late joiner receives events emitted after it attached
    assert.deepEqual(eventsB, [{ step: 2 }]);
    assert.deepEqual(eventsA, [{ step: 1 }, { step: 2 }]);
});

test("run continues after all listeners detach", async () => {
    const emitted: unknown[] = [];
    let releaseRun!: () => void;
    const gate = new Promise<void>((resolve) => (releaseRun = resolve));

    const { detach, done } = attachOrStartRun(
        "review-2",
        () => {},
        async (emit) => {
            await gate;
            emitted.push("finished-work");
            emit({ final: true });
        },
    );

    detach(); // client disconnected mid-run
    releaseRun();
    await done;
    assert.deepEqual(emitted, ["finished-work"]);
    assert.equal(isRunActive("review-2"), false);
});

test("a failing run clears itself so the review can be re-run", async () => {
    const { done } = attachOrStartRun(
        "review-3",
        () => {},
        async () => {
            throw new Error("LLM exploded");
        },
    );
    await done; // must not reject — errors are contained
    assert.equal(isRunActive("review-3"), false);
});
