import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateUsage, type UsageEventRow } from "../src/lib/usageMetrics";

// The /admin/metrics endpoint fetches raw rows and aggregates in Node;
// these tests pin the aggregation the dashboard numbers come from.

const rows: UsageEventRow[] = [
    { event: "app.open", user_id: "u1", status: 200, created_at: "2026-07-10T09:00:00Z" },
    { event: "app.open", user_id: "u2", status: 200, created_at: "2026-07-10T10:00:00Z" },
    { event: "chat.message", user_id: "u1", status: 200, created_at: "2026-07-10T11:00:00Z" },
    { event: "app.open", user_id: "u1", status: 200, created_at: "2026-07-11T09:00:00Z" },
    { event: "server_error", user_id: null, status: 500, created_at: "2026-07-11T09:30:00Z" },
];

test("aggregateUsage totals events across the window", () => {
    const agg = aggregateUsage(rows);
    assert.equal(agg.totals["app.open"], 3);
    assert.equal(agg.totals["chat.message"], 1);
    assert.equal(agg.totals["server_error"], 1);
    assert.equal(agg.errorCount, 1);
});

test("aggregateUsage counts distinct active users per day and overall", () => {
    const agg = aggregateUsage(rows);
    assert.deepEqual(agg.activeUsersByDay, [
        { day: "2026-07-10", count: 2 },
        { day: "2026-07-11", count: 1 },
    ]);
    assert.equal(agg.activeUsersTotal, 2);
});

test("aggregateUsage buckets daily counts by day and event", () => {
    const agg = aggregateUsage(rows);
    assert.deepEqual(
        agg.daily.filter((d) => d.event === "app.open"),
        [
            { day: "2026-07-10", event: "app.open", count: 2 },
            { day: "2026-07-11", event: "app.open", count: 1 },
        ],
    );
});

test("aggregateUsage handles an empty window", () => {
    const agg = aggregateUsage([]);
    assert.deepEqual(agg.totals, {});
    assert.deepEqual(agg.daily, []);
    assert.equal(agg.activeUsersTotal, 0);
    assert.equal(agg.errorCount, 0);
});
