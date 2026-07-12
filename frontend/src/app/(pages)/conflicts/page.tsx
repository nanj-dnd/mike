"use client";

import { useEffect, useState } from "react";
import {
    Loader2,
    Plus,
    Scale,
    ShieldAlert,
    ShieldCheck,
    X,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/app/components/shared/PageHeader";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { ModalSelect } from "@/app/components/modals/ModalSelect";
import {
    getProjectParties,
    listConflictHistory,
    listProjects,
    runConflictCheck,
    type ConflictCheckRecord,
    type ConflictCheckResult,
    type ConflictParty,
    type ConflictPartySide,
} from "@/app/lib/mikeApi";
import type { Project } from "@/app/components/shared/types";

/**
 * Conflict-of-interest checking. Enter the parties on a new matter and
 * the platform searches the firm's party register — every matter owned
 * by you or a member of your organizations — for the same names on the
 * other side of the table. Checks are recorded, because "we ran a
 * conflict check before opening the file" is something firms have to be
 * able to prove later.
 */

const SIDE_OPTIONS = [
    { value: "client", label: "Our client" },
    { value: "opposing", label: "Opposing party" },
    { value: "other", label: "Other party" },
] as const;

function sideLabel(side: ConflictPartySide): string {
    return SIDE_OPTIONS.find((o) => o.value === side)?.label ?? side;
}

const emptyParty = (): ConflictParty => ({ name: "", side: "client" });

export default function ConflictsPage() {
    const [parties, setParties] = useState<ConflictParty[]>([
        emptyParty(),
        { name: "", side: "opposing" },
    ]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [projectId, setProjectId] = useState("");
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ConflictCheckResult | null>(null);
    const [history, setHistory] = useState<ConflictCheckRecord[] | null>(null);

    useEffect(() => {
        listProjects()
            .then(setProjects)
            .catch(() => setProjects([]));
        listConflictHistory()
            .then(setHistory)
            .catch(() => setHistory([]));
    }, []);

    const handleSelectProject = async (id: string) => {
        setProjectId(id);
        if (!id) return;
        try {
            const registered = await getProjectParties(id);
            if (registered.length > 0) setParties(registered);
        } catch {
            // Prefill is best-effort; the form stays editable either way.
        }
    };

    const updateParty = (index: number, patch: Partial<ConflictParty>) => {
        setParties((prev) =>
            prev.map((p, i) => (i === index ? { ...p, ...patch } : p)),
        );
    };

    const handleRun = async () => {
        const filled = parties
            .map((p) => ({ ...p, name: p.name.trim() }))
            .filter((p) => p.name);
        if (filled.length === 0) {
            setError("Add at least one party name.");
            return;
        }
        setRunning(true);
        setError(null);
        setResult(null);
        try {
            const checkResult = await runConflictCheck({
                parties: filled,
                projectId: projectId || null,
            });
            setResult(checkResult);
            setHistory((prev) =>
                prev
                    ? [
                          {
                              ...checkResult,
                              project_id: projectId || null,
                              parties: filled,
                          },
                          ...prev,
                      ]
                    : prev,
            );
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Conflict check failed. Please try again.",
            );
        } finally {
            setRunning(false);
        }
    };

    const projectOptions = [
        { value: "", label: "No matter — ad-hoc check" },
        ...projects.map((p) => ({ value: p.id, label: p.name })),
    ];

    return (
        <div className="flex h-full flex-col overflow-y-auto">
            <PageHeader breadcrumbs={[{ label: "Conflict Check" }]} />

            <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-10 pt-2">
                <p className="mb-4 text-sm text-gray-500">
                    Before opening a new matter, list the parties involved.
                    Gavel searches every matter registered by you and your
                    organization for the same names — and flags anyone who
                    appears on the other side. Every check is recorded.
                </p>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <label
                        htmlFor="conflict-matter"
                        className="mb-2 block text-sm font-medium text-gray-700"
                    >
                        Matter{" "}
                        <span className="font-normal text-gray-400">
                            (optional — linking saves these parties to the
                            matter&apos;s register)
                        </span>
                    </label>
                    <ModalSelect
                        id="conflict-matter"
                        value={projectId}
                        options={projectOptions}
                        onChange={(v) => void handleSelectProject(v)}
                        placeholder="No matter — ad-hoc check"
                    />

                    <div className="mt-4 space-y-2">
                        {parties.map((party, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <Input
                                    value={party.name}
                                    onChange={(e) =>
                                        updateParty(index, {
                                            name: e.target.value,
                                        })
                                    }
                                    placeholder="Party name, e.g. Sharma Steel Pvt Ltd"
                                    className="flex-1 rounded-lg border border-transparent bg-gray-100 px-3 shadow-none focus-visible:border-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300/45"
                                />
                                <div className="w-44 shrink-0">
                                    <ModalSelect
                                        id={`conflict-side-${index}`}
                                        value={party.side}
                                        options={SIDE_OPTIONS}
                                        onChange={(v) =>
                                            updateParty(index, {
                                                side: v as ConflictPartySide,
                                            })
                                        }
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setParties((prev) =>
                                            prev.length > 1
                                                ? prev.filter(
                                                      (_, i) => i !== index,
                                                  )
                                                : prev,
                                        )
                                    }
                                    aria-label="Remove party"
                                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() =>
                                setParties((prev) => [...prev, emptyParty()])
                            }
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
                        >
                            <Plus className="h-4 w-4" />
                            Add party
                        </button>
                        <Button
                            onClick={() => void handleRun()}
                            disabled={running}
                            className="rounded-lg bg-gray-950 text-white hover:bg-gray-900"
                        >
                            {running ? "Checking…" : "Run conflict check"}
                        </Button>
                    </div>

                    {error && (
                        <p className="mt-3 text-sm text-red-600">{error}</p>
                    )}
                </div>

                {result && (
                    <div className="mt-4">
                        {result.status === "clear" ? (
                            <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
                                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                                <div>
                                    <p className="text-sm font-medium text-green-900">
                                        No conflicts found
                                    </p>
                                    <p className="mt-0.5 text-sm text-green-700">
                                        None of these parties appear in your
                                        firm&apos;s matter register. This check
                                        has been recorded.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                                <div className="flex items-start gap-3">
                                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                                    <div>
                                        <p className="text-sm font-medium text-amber-900">
                                            Potential conflicts —{" "}
                                            {result.hits.length}{" "}
                                            {result.hits.length === 1
                                                ? "hit"
                                                : "hits"}
                                        </p>
                                        <p className="mt-0.5 text-sm text-amber-700">
                                            Review each hit before accepting
                                            the engagement. This check has
                                            been recorded.
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-3 space-y-2">
                                    {result.hits.map((hit, i) => (
                                        <div
                                            key={i}
                                            className="rounded-lg border border-amber-200/70 bg-white p-3"
                                        >
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                        hit.severity ===
                                                        "adverse"
                                                            ? "bg-red-100 text-red-700"
                                                            : "bg-gray-100 text-gray-600"
                                                    }`}
                                                >
                                                    {hit.severity === "adverse"
                                                        ? "Adverse"
                                                        : "Related"}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                    {hit.match === "exact"
                                                        ? "Exact name match"
                                                        : "Partial name match"}
                                                </span>
                                            </div>
                                            <p className="mt-1.5 text-sm text-gray-900">
                                                <span className="font-medium">
                                                    {hit.queryName}
                                                </span>{" "}
                                                ({sideLabel(hit.querySide)})
                                                matches{" "}
                                                <span className="font-medium">
                                                    {hit.matchedName}
                                                </span>{" "}
                                                ({sideLabel(hit.matchedSide)})
                                                in{" "}
                                                <Link
                                                    href={`/projects/${hit.projectId}`}
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    {hit.projectName}
                                                </Link>
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <h2 className="mb-2 mt-8 text-sm font-medium text-gray-900">
                    Recent checks
                </h2>
                {history === null ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading history…
                    </div>
                ) : history.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
                        <Scale className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                        <p className="text-sm text-gray-500">
                            No conflict checks yet. Run one above before
                            opening your next matter.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {history.map((check) => (
                            <div
                                key={check.id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm text-gray-900">
                                        {check.parties
                                            .map((p) => p.name)
                                            .join(" · ")}
                                    </p>
                                    <p className="mt-0.5 text-xs text-gray-400">
                                        {new Date(
                                            check.created_at,
                                        ).toLocaleString()}
                                    </p>
                                </div>
                                <span
                                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                        check.status === "clear"
                                            ? "bg-green-100 text-green-700"
                                            : "bg-amber-100 text-amber-700"
                                    }`}
                                >
                                    {check.status === "clear"
                                        ? "Clear"
                                        : `Flagged (${check.hits.length})`}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
