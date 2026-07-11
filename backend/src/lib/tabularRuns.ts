/**
 * Detached tabular-review run coordinator.
 *
 * Extraction used to run inside the HTTP request: a dropped connection,
 * proxy timeout, or double-click killed or duplicated the run. Runs now
 * execute detached from any response — the SSE handler merely subscribes to
 * a run's events. Cell state lives in tabular_cells, so a client that
 * reconnects (or just refreshes) sees progress regardless of the stream.
 *
 * One run per review at a time: a second generate request while a run is
 * active attaches to the in-flight run instead of starting a duplicate.
 */

export type RunEvent = Record<string, unknown>;
export type EmitFn = (event: RunEvent) => void;

type ActiveRun = {
    listeners: Set<EmitFn>;
    done: Promise<void>;
};

const activeRuns = new Map<string, ActiveRun>();

export function isRunActive(reviewId: string): boolean {
    return activeRuns.has(reviewId);
}

/**
 * Attach `listener` to the active run for `reviewId`, starting one via
 * `start` if none is running. The run promise is intentionally not tied to
 * any HTTP response: it keeps executing after every listener detaches.
 */
export function attachOrStartRun(
    reviewId: string,
    listener: EmitFn,
    start: (emit: EmitFn) => Promise<void>,
): { attachedToExisting: boolean; done: Promise<void>; detach: () => void } {
    let run = activeRuns.get(reviewId);
    const attachedToExisting = !!run;

    if (!run) {
        const listeners = new Set<EmitFn>();
        // Register the first listener before starting so events emitted
        // synchronously at the top of the run are not lost.
        listeners.add(listener);
        const emit: EmitFn = (event) => {
            for (const l of listeners) {
                try {
                    l(event);
                } catch {
                    /* a broken listener must not kill the run */
                }
            }
        };
        const done = start(emit)
            .catch((err) => {
                console.error(
                    `[tabular/run] review=${reviewId} run failed`,
                    err instanceof Error ? err.message : err,
                );
            })
            .finally(() => {
                activeRuns.delete(reviewId);
            });
        run = { listeners, done };
        activeRuns.set(reviewId, run);
    } else {
        run.listeners.add(listener);
    }

    const currentRun = run;
    return {
        attachedToExisting,
        done: run.done,
        detach: () => currentRun.listeners.delete(listener),
    };
}

/** Process items with at most `limit` in flight, preserving no order. */
export async function mapWithConcurrency<T>(
    items: readonly T[],
    limit: number,
    fn: (item: T) => Promise<void>,
): Promise<void> {
    const queue = [...items];
    const workers = Array.from(
        { length: Math.max(1, Math.min(limit, queue.length)) },
        async () => {
            for (;;) {
                const item = queue.shift();
                if (item === undefined) return;
                await fn(item);
            }
        },
    );
    await Promise.all(workers);
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
