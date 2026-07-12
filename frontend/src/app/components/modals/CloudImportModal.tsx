"use client";

import { useCallback, useEffect, useState } from "react";
import {
    Cloud,
    FileText,
    Link2,
    Loader2,
    RefreshCw,
    Search,
    X,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
    disconnectCloudImportAccount,
    importCloudFiles,
    importDocumentFromUrl,
    listCloudImportFiles,
    listCloudImportProviders,
    startCloudImportOAuth,
    type CloudFile,
    type CloudImportProvider,
    type CloudProviderStatus,
} from "@/app/lib/mikeApi";
import type { Document } from "@/app/components/shared/types";

/**
 * Import documents from Google Drive, OneDrive, or a URL. Files are
 * fetched server-side with the connected account's token and pushed
 * through the normal upload pipeline, so imported documents behave
 * exactly like uploads (versions, PDF renditions, semantic indexing).
 */

type TabKey = CloudImportProvider | "url";

const PROVIDER_LABELS: Record<CloudImportProvider, string> = {
    google_drive: "Google Drive",
    onedrive: "OneDrive",
};

// The OAuth popup page is served by the backend, so its postMessage
// arrives from the API origin, not this app's origin.
const oauthMessageOrigin = new URL(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
).origin;

interface Props {
    open: boolean;
    onClose: () => void;
    onImported: (documents: Document[]) => void;
    projectId?: string;
}

export function CloudImportModal({
    open,
    onClose,
    onImported,
    projectId,
}: Props) {
    const [tab, setTab] = useState<TabKey>("google_drive");
    const [providers, setProviders] = useState<CloudProviderStatus[] | null>(
        null,
    );
    const [error, setError] = useState<string | null>(null);

    const refreshProviders = useCallback(() => {
        listCloudImportProviders()
            .then((next) => {
                setError(null);
                setProviders(next);
                // Land on the first usable provider tab.
                const firstUsable = next.find((p) => p.configured);
                if (firstUsable) {
                    setTab((current) =>
                        current === "url" ||
                        next.find((p) => p.provider === current)?.configured
                            ? current
                            : firstUsable.provider,
                    );
                } else {
                    setTab("url");
                }
            })
            .catch(() =>
                setError("Could not load cloud import providers."),
            );
    }, []);

    useEffect(() => {
        if (!open) return;
        refreshProviders();
    }, [open, refreshProviders]);

    if (!open) return null;

    const tabs: { key: TabKey; label: string }[] = [
        ...(providers ?? [])
            .filter((p) => p.configured)
            .map((p) => ({ key: p.provider, label: PROVIDER_LABELS[p.provider] })),
        { key: "url" as TabKey, label: "From URL" },
    ];
    const activeProvider =
        tab !== "url"
            ? (providers ?? []).find((p) => p.provider === tab) ?? null
            : null;

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-gray-900/30 p-4">
            <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-6 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-medium font-serif text-gray-900">
                        Import documents
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="mb-4 flex gap-1 rounded-full bg-gray-100 p-1 text-xs font-medium">
                    {tabs.map(({ key, label }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={`inline-flex h-7 items-center rounded-full px-3 transition-colors ${
                                tab === key
                                    ? "bg-white text-gray-900 shadow-sm"
                                    : "text-gray-500 hover:text-gray-900"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {error && (
                    <p className="mb-3 text-sm text-red-600">{error}</p>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {tab === "url" ? (
                        <UrlImportTab
                            projectId={projectId}
                            onImported={onImported}
                        />
                    ) : providers === null ? (
                        <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading…
                        </div>
                    ) : activeProvider ? (
                        <ProviderTab
                            status={activeProvider}
                            projectId={projectId}
                            onImported={onImported}
                            onAccountChange={refreshProviders}
                        />
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function ProviderTab({
    status,
    projectId,
    onImported,
    onAccountChange,
}: {
    status: CloudProviderStatus;
    projectId?: string;
    onImported: (documents: Document[]) => void;
    onAccountChange: () => void;
}) {
    const provider = status.provider;
    const label = PROVIDER_LABELS[provider];
    const [connecting, setConnecting] = useState(false);
    const [query, setQuery] = useState("");
    const [files, setFiles] = useState<CloudFile[] | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [importing, setImporting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const loadFiles = useCallback(
        (q: string) => {
            setFiles(null);
            listCloudImportFiles(provider, q)
                .then(setFiles)
                .catch((err) => {
                    setFiles([]);
                    setMessage(
                        err instanceof Error
                            ? err.message
                            : `Could not list ${label} files.`,
                    );
                });
        },
        [provider, label],
    );

    useEffect(() => {
        setSelected(new Set());
        setMessage(null);
        setQuery("");
        if (status.connected) loadFiles("");
    }, [provider, status.connected, loadFiles]);

    useEffect(() => {
        if (!status.connected) return;
        const t = setTimeout(() => loadFiles(query), 350);
        return () => clearTimeout(t);
    }, [query, status.connected, loadFiles]);

    const handleConnect = async () => {
        setConnecting(true);
        setMessage(null);
        try {
            const { authorizeUrl } = await startCloudImportOAuth(provider);
            const popup = window.open(
                authorizeUrl,
                "gavel-cloud-import",
                "width=560,height=680",
            );
            if (!popup) {
                window.location.assign(authorizeUrl);
                return;
            }
            await new Promise<void>((resolve, reject) => {
                const timeout = window.setTimeout(() => {
                    cleanup();
                    reject(new Error("Authorization timed out."));
                }, 5 * 60 * 1000);
                const poll = window.setInterval(() => {
                    if (popup.closed) {
                        cleanup();
                        reject(
                            new Error("Authorization window was closed."),
                        );
                    }
                }, 700);
                const cleanup = () => {
                    window.clearTimeout(timeout);
                    window.clearInterval(poll);
                    window.removeEventListener("message", onMessage);
                };
                const onMessage = (
                    event: MessageEvent<{
                        type?: string;
                        success?: boolean;
                        provider?: string;
                        detail?: string;
                    }>,
                ) => {
                    if (event.origin !== oauthMessageOrigin) return;
                    if (event.data?.type !== "cloud_import_oauth_result")
                        return;
                    if (
                        event.data.provider &&
                        event.data.provider !== provider
                    )
                        return;
                    cleanup();
                    if (event.data.success) resolve();
                    else
                        reject(
                            new Error(
                                event.data.detail || "Authorization failed.",
                            ),
                        );
                };
                window.addEventListener("message", onMessage);
            });
            onAccountChange();
        } catch (err) {
            setMessage(
                err instanceof Error
                    ? err.message
                    : `Could not connect ${label}.`,
            );
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            await disconnectCloudImportAccount(provider);
            onAccountChange();
        } catch (err) {
            setMessage(
                err instanceof Error
                    ? err.message
                    : `Could not disconnect ${label}.`,
            );
        }
    };

    const handleImport = async () => {
        if (selected.size === 0) return;
        setImporting(true);
        setMessage(null);
        try {
            const { documents, failures } = await importCloudFiles(
                provider,
                [...selected],
                projectId ?? null,
            );
            if (failures.length > 0) {
                setMessage(
                    `${failures.length} file${failures.length === 1 ? "" : "s"} failed: ${failures[0].detail}`,
                );
            }
            if (documents.length > 0) {
                onImported(documents);
                setSelected(new Set());
            }
        } catch (err) {
            setMessage(
                err instanceof Error ? err.message : "Import failed.",
            );
        } finally {
            setImporting(false);
        }
    };

    if (!status.connected) {
        return (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
                <Cloud className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                <p className="text-sm font-medium text-gray-900">
                    Connect your {label} account
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                    Gavel gets read-only access and fetches the files you pick
                    on our servers — nothing else is copied.
                </p>
                <Button
                    onClick={() => void handleConnect()}
                    disabled={connecting}
                    className="mt-4 rounded-lg bg-gray-950 text-white hover:bg-gray-900"
                >
                    {connecting ? "Waiting for authorization…" : `Connect ${label}`}
                </Button>
                {message && (
                    <p className="mt-3 text-sm text-red-600">{message}</p>
                )}
            </div>
        );
    }

    return (
        <div>
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                <span className="truncate">
                    Connected{status.accountEmail ? ` as ${status.accountEmail}` : ""}
                </span>
                <button
                    type="button"
                    onClick={() => void handleDisconnect()}
                    className="shrink-0 font-medium text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
                >
                    Disconnect
                </button>
            </div>
            <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search ${label}…`}
                    className="w-full rounded-lg border border-transparent bg-gray-100 pl-9 pr-3 shadow-none focus-visible:border-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300/45"
                />
            </div>

            {files === null ? (
                <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading files…
                </div>
            ) : files.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">
                    No importable documents found.
                </p>
            ) : (
                <div className="max-h-72 space-y-1 overflow-y-auto">
                    {files.map((file) => {
                        const checked = selected.has(file.id);
                        return (
                            <label
                                key={file.id}
                                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50"
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                        setSelected((prev) => {
                                            const next = new Set(prev);
                                            if (checked) next.delete(file.id);
                                            else next.add(file.id);
                                            return next;
                                        })
                                    }
                                    className="h-4 w-4 rounded border-gray-300"
                                />
                                <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                                <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                                    {file.name}
                                    {file.exportedAs && (
                                        <span className="ml-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-500">
                                            → {file.exportedAs}
                                        </span>
                                    )}
                                </span>
                                {file.modifiedAt && (
                                    <span className="shrink-0 text-xs text-gray-400">
                                        {new Date(
                                            file.modifiedAt,
                                        ).toLocaleDateString()}
                                    </span>
                                )}
                            </label>
                        );
                    })}
                </div>
            )}

            {message && <p className="mt-2 text-sm text-red-600">{message}</p>}

            <div className="mt-3 flex items-center justify-between">
                <button
                    type="button"
                    onClick={() => loadFiles(query)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                </button>
                <Button
                    onClick={() => void handleImport()}
                    disabled={selected.size === 0 || importing}
                    className="rounded-lg bg-gray-950 text-white hover:bg-gray-900"
                >
                    {importing
                        ? "Importing…"
                        : `Import${selected.size > 0 ? ` ${selected.size}` : ""}`}
                </Button>
            </div>
        </div>
    );
}

function UrlImportTab({
    projectId,
    onImported,
}: {
    projectId?: string;
    onImported: (documents: Document[]) => void;
}) {
    const [url, setUrl] = useState("");
    const [importing, setImporting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const handleImport = async () => {
        if (!url.trim()) return;
        setImporting(true);
        setMessage(null);
        try {
            const documents = await importDocumentFromUrl(
                url.trim(),
                projectId ?? null,
            );
            onImported(documents);
            setUrl("");
        } catch (err) {
            setMessage(
                err instanceof Error ? err.message : "Import failed.",
            );
        } finally {
            setImporting(false);
        }
    };

    return (
        <div>
            <p className="mb-3 text-sm text-gray-500">
                Paste a direct HTTPS link to a document (pdf, docx, xlsx,
                pptx…). The file is fetched server-side and added like an
                upload.
            </p>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://example.com/agreement.pdf"
                        className="w-full rounded-lg border border-transparent bg-gray-100 pl-9 pr-3 shadow-none focus-visible:border-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300/45"
                    />
                </div>
                <Button
                    onClick={() => void handleImport()}
                    disabled={!url.trim() || importing}
                    className="shrink-0 rounded-lg bg-gray-950 text-white hover:bg-gray-900"
                >
                    {importing ? "Importing…" : "Import"}
                </Button>
            </div>
            {message && <p className="mt-2 text-sm text-red-600">{message}</p>}
        </div>
    );
}
