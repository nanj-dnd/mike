"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, XCircle } from "lucide-react";
import { cn } from "@/app/lib/utils";
import { PageHeader } from "@/app/components/shared/PageHeader";
import {
    cancelWorkflowEngineRun,
    getWorkflowEngineRun,
    listWorkflowEngineRuns,
    resumeWorkflowEngineRun,
    type WorkflowEngineRun,
    type WorkflowEngineRunTrace,
} from "@/app/lib/mikeApi";

const STATUS_STYLES: Record<string, string> = {
    succeeded: "bg-green-50 text-green-700",
    failed: "bg-red-50 text-red-600",
    running: "bg-blue-50 text-blue-600",
    waiting: "bg-amber-50 text-amber-700",
    canceled: "bg-gray-100 text-gray-500",
    pending: "bg-gray-100 text-gray-500",
    skipped: "bg-gray-100 text-gray-400",
};

function StatusPill({ status }: { status: string }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                STATUS_STYLES[status] ?? "bg-gray-100 text-gray-500",
            )}
        >
            {(status === "running" || status === "pending") && (
                <Loader2 className="h-3 w-3 animate-spin" />
            )}
            {status}
        </span>
    );
}

function duration(start: string | null, end: string | null): string {
    if (!start) return "—";
    const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function WorkflowRunsView() {
    const [runs, setRuns] = useState<WorkflowEngineRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [trace, setTrace] = useState<WorkflowEngineRunTrace | null>(null);

    const load = useCallback(async () => {
        try {
            setRuns(await listWorkflowEngineRuns());
        } catch {
            // engine tables may not be migrated yet; show empty state
        } finally {
            setLoading(false);
        }
    }, []);

    const loadTrace = useCallback(async (runId: string) => {
        try {
            setTrace(await getWorkflowEngineRun(runId));
        } catch {
            setTrace(null);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    // Auto-refresh while the expanded run is still moving.
    useEffect(() => {
        if (!expandedId) return;
        const status = trace?.run.status;
        if (status && ["succeeded", "failed", "canceled"].includes(status)) return;
        const timer = setInterval(() => {
            void loadTrace(expandedId);
            void load();
        }, 4000);
        return () => clearInterval(timer);
    }, [expandedId, trace?.run.status, load, loadTrace]);

    const toggleExpand = (runId: string) => {
        if (expandedId === runId) {
            setExpandedId(null);
            setTrace(null);
        } else {
            setExpandedId(runId);
            setTrace(null);
            void loadTrace(runId);
        }
    };

    return (
        <div className="flex h-full flex-col px-4 md:px-8">
            <PageHeader shrink loading={loading}>
                <div className="flex items-baseline gap-3">
                    <h1 className="text-2xl font-medium font-serif text-gray-900">
                        Workflow Runs
                    </h1>
                    <Link
                        href="/workflows"
                        className="text-sm text-gray-500 transition-colors hover:text-gray-900"
                    >
                        ← Workflows
                    </Link>
                </div>
            </PageHeader>

            <div className="min-h-0 flex-1 overflow-y-auto pb-10">
                <div className="mb-3 flex justify-end">
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                    >
                        <RefreshCw className="h-3.5 w-3.5" /> Refresh
                    </button>
                </div>

                {!loading && runs.length === 0 && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
                        No workflow runs yet. Start one from a workflow&apos;s
                        detail page or via the API.
                    </div>
                )}

                <div className="space-y-2">
                    {runs.map((run) => (
                        <div
                            key={run.id}
                            className="overflow-hidden rounded-xl border border-gray-200 bg-white"
                        >
                            <button
                                type="button"
                                onClick={() => toggleExpand(run.id)}
                                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                            >
                                <StatusPill status={run.status} />
                                <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-500">
                                    {run.id}
                                </span>
                                <span className="text-xs text-gray-400">
                                    {run.trigger_source}
                                </span>
                                <span className="text-xs text-gray-400">
                                    {duration(run.started_at, run.finished_at)}
                                </span>
                                <span className="hidden text-xs text-gray-400 sm:block">
                                    {new Date(run.created_at).toLocaleString()}
                                </span>
                            </button>
                            {expandedId === run.id && (
                                <RunTrace
                                    trace={trace}
                                    onCancel={async () => {
                                        await cancelWorkflowEngineRun(run.id);
                                        await Promise.all([load(), loadTrace(run.id)]);
                                    }}
                                    onResume={async (nodeId, response) => {
                                        await resumeWorkflowEngineRun(run.id, nodeId, response);
                                        await Promise.all([load(), loadTrace(run.id)]);
                                    }}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function RunTrace({
    trace,
    onCancel,
    onResume,
}: {
    trace: WorkflowEngineRunTrace | null;
    onCancel: () => Promise<void>;
    onResume: (nodeId: string, response: unknown) => Promise<void>;
}) {
    const [busy, setBusy] = useState(false);
    const [freeText, setFreeText] = useState("");

    if (!trace) {
        return (
            <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-4 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading trace…
            </div>
        );
    }

    const cancellable = ["pending", "running", "waiting"].includes(trace.run.status);
    const waitingNodes = trace.node_runs.filter((n) => n.status === "waiting");

    return (
        <div className="space-y-3 border-t border-gray-100 px-4 py-4">
            {trace.run.error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                    {trace.run.error}
                </p>
            )}

            <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                    <thead>
                        <tr className="text-gray-400">
                            <th className="pb-2 pr-3 font-medium">Node</th>
                            <th className="pb-2 pr-3 font-medium">Status</th>
                            <th className="pb-2 pr-3 font-medium">Attempt</th>
                            <th className="pb-2 pr-3 font-medium">Model</th>
                            <th className="pb-2 pr-3 font-medium">Tokens</th>
                            <th className="pb-2 font-medium">Duration</th>
                        </tr>
                    </thead>
                    <tbody className="text-gray-600">
                        {trace.node_runs.map((node) => (
                            <tr key={node.node_id} className="border-t border-gray-50">
                                <td className="py-2 pr-3 font-mono">{node.node_id}</td>
                                <td className="py-2 pr-3">
                                    <StatusPill status={node.status} />
                                </td>
                                <td className="py-2 pr-3">{node.attempt}</td>
                                <td className="py-2 pr-3">{node.model ?? "—"}</td>
                                <td className="py-2 pr-3">
                                    {node.prompt_tokens != null
                                        ? `${node.prompt_tokens}↑ ${node.completion_tokens ?? 0}↓`
                                        : "—"}
                                </td>
                                <td className="py-2">
                                    {duration(node.started_at, node.finished_at)}
                                    {node.error && (
                                        <span className="ml-2 text-red-500">
                                            {node.error.message.slice(0, 120)}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {waitingNodes.map((node) => {
                const input = (node.input ?? {}) as {
                    prompt?: string;
                    choices?: string[] | null;
                };
                return (
                    <div
                        key={node.node_id}
                        className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3"
                    >
                        <p className="text-sm font-medium text-amber-800">
                            Waiting for input — {node.node_id}
                        </p>
                        {input.prompt && (
                            <p className="text-sm text-gray-700">{input.prompt}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                            {(input.choices ?? []).map((choice) => (
                                <button
                                    key={choice}
                                    type="button"
                                    disabled={busy}
                                    onClick={async () => {
                                        setBusy(true);
                                        try {
                                            await onResume(node.node_id, { choice });
                                        } finally {
                                            setBusy(false);
                                        }
                                    }}
                                    className="rounded-lg bg-gray-950 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                                >
                                    {choice}
                                </button>
                            ))}
                            {(!input.choices || input.choices.length === 0) && (
                                <>
                                    <input
                                        value={freeText}
                                        onChange={(e) => setFreeText(e.target.value)}
                                        placeholder="Response…"
                                        className="h-8 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-xs"
                                    />
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={async () => {
                                            setBusy(true);
                                            try {
                                                await onResume(node.node_id, {
                                                    input: freeText,
                                                });
                                                setFreeText("");
                                            } finally {
                                                setBusy(false);
                                            }
                                        }}
                                        className="rounded-lg bg-gray-950 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                                    >
                                        Submit
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                );
            })}

            {cancellable && (
                <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                        setBusy(true);
                        try {
                            await onCancel();
                        } finally {
                            setBusy(false);
                        }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                    <XCircle className="h-3.5 w-3.5" /> Cancel run
                </button>
            )}
        </div>
    );
}
