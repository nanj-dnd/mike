"use client";

import { useCallback, useEffect, useState } from "react";
import { BookMarked, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/app/components/shared/PageHeader";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import {
    createClause,
    deleteClause,
    listClauses,
    updateClause,
    type Clause,
} from "@/app/lib/mikeApi";

/**
 * Firm clause library (precedent bank). Clauses saved here are searchable
 * by the assistant via search_clause_library, so drafts reuse the firm's
 * approved language.
 */
export default function ClausesPage() {
    const [clauses, setClauses] = useState<Clause[] | null>(null);
    const [query, setQuery] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<Clause | null>(null);

    const load = useCallback(async (q?: string) => {
        try {
            setClauses(await listClauses(q));
        } catch {
            setError("Failed to load clause library.");
            setClauses([]);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        const t = setTimeout(() => load(query), 300);
        return () => clearTimeout(t);
    }, [query, load]);

    const handleDelete = async (clause: Clause) => {
        if (!confirm(`Delete clause "${clause.title}"?`)) return;
        try {
            await deleteClause(clause.id);
            setClauses((prev) =>
                prev ? prev.filter((c) => c.id !== clause.id) : prev,
            );
        } catch {
            setError("Failed to delete clause.");
        }
    };

    return (
        <div className="flex h-full flex-col overflow-y-auto">
            <PageHeader
                breadcrumbs={[{ label: "Clause Library" }]}
                actions={[
                    {
                        type: "search",
                        value: query,
                        onChange: setQuery,
                        placeholder: "Search clauses...",
                    },
                    {
                        icon: <Plus className="h-4 w-4" />,
                        label: "New clause",
                        onClick: () => {
                            setEditing(null);
                            setEditorOpen(true);
                        },
                    },
                ]}
            />

            <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-10 pt-2">
                <p className="mb-4 text-sm text-gray-500">
                    Save your firm&apos;s approved clause language here. When
                    the assistant drafts a document, it checks this library
                    first and reuses your negotiated positions instead of
                    generic language.
                </p>

                {error && (
                    <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {clauses === null ? (
                    <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading clause library…
                    </div>
                ) : clauses.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center">
                        <BookMarked className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                        <p className="text-sm font-medium text-gray-900">
                            {query
                                ? "No clauses match your search."
                                : "Your clause library is empty."}
                        </p>
                        {!query && (
                            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                                Start with the clauses you negotiate most —
                                limitation of liability, indemnity,
                                termination, confidentiality, arbitration —
                                and the assistant will use them in every
                                draft.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {clauses.map((clause) => (
                            <div
                                key={clause.id}
                                className="rounded-xl border border-gray-200 bg-white p-4"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-900">
                                            {clause.title}
                                        </p>
                                        {clause.category && (
                                            <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                                {clause.category}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 gap-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditing(clause);
                                                setEditorOpen(true);
                                            }}
                                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                            title="Edit"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void handleDelete(clause)
                                            }
                                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                            title="Delete"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                                    {clause.body.length > 400
                                        ? `${clause.body.slice(0, 400)}…`
                                        : clause.body}
                                </p>
                                {clause.guidance && (
                                    <p className="mt-2 border-l-2 border-gray-200 pl-3 text-xs leading-5 text-gray-500">
                                        {clause.guidance}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {editorOpen && (
                <ClauseEditor
                    clause={editing}
                    onClose={() => setEditorOpen(false)}
                    onSaved={(saved) => {
                        setEditorOpen(false);
                        setClauses((prev) => {
                            if (!prev) return [saved];
                            const idx = prev.findIndex(
                                (c) => c.id === saved.id,
                            );
                            if (idx === -1) return [saved, ...prev];
                            const next = [...prev];
                            next[idx] = saved;
                            return next;
                        });
                    }}
                />
            )}
        </div>
    );
}

function ClauseEditor({
    clause,
    onClose,
    onSaved,
}: {
    clause: Clause | null;
    onClose: () => void;
    onSaved: (clause: Clause) => void;
}) {
    const [title, setTitle] = useState(clause?.title ?? "");
    const [category, setCategory] = useState(clause?.category ?? "");
    const [body, setBody] = useState(clause?.body ?? "");
    const [guidance, setGuidance] = useState(clause?.guidance ?? "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        if (!title.trim() || !body.trim()) {
            setError("Title and clause text are required.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const saved = clause
                ? await updateClause(clause.id, {
                      title: title.trim(),
                      category: category.trim(),
                      body: body.trim(),
                      guidance: guidance.trim(),
                  })
                : await createClause({
                      title: title.trim(),
                      category: category.trim() || undefined,
                      body: body.trim(),
                      guidance: guidance.trim() || undefined,
                  });
            onSaved(saved);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to save clause.",
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-gray-900/30 p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-medium font-serif text-gray-900">
                        {clause ? "Edit clause" : "New clause"}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Title, e.g. Limitation of Liability — services"
                        />
                        <Input
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            placeholder="Category (optional), e.g. Liability"
                        />
                    </div>
                    <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="The approved clause text…"
                        rows={8}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-300/45"
                    />
                    <textarea
                        value={guidance}
                        onChange={(e) => setGuidance(e.target.value)}
                        placeholder="Drafting guidance (optional) — when to use it, fallback positions, what never to concede…"
                        rows={3}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-300/45"
                    />
                    {error && (
                        <p className="text-sm text-red-600">{error}</p>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            className="rounded-lg"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void handleSave()}
                            disabled={saving}
                            className="rounded-lg bg-gray-950 text-white hover:bg-gray-900"
                        >
                            {saving ? "Saving…" : "Save clause"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
