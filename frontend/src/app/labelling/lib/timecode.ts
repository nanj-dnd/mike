export function formatTime(ms: number) {
  if (!Number.isFinite(ms)) return "00:00.000";
  const clampedMs = Math.max(0, ms);
  const totalSeconds = clampedMs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.floor(clampedMs % 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function parseTimecode(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;

  const parts = normalized.split(":");
  if (parts.length > 3 || parts.some((part) => part.trim() === "")) return null;

  const numbers = parts.map(Number);
  if (numbers.some((part) => !Number.isFinite(part) || part < 0)) return null;

  if (parts.length === 1) return numbers[0] * 1000;

  const seconds = numbers.at(-1) ?? 0;
  const minutes = numbers.at(-2) ?? 0;
  const hours = numbers.at(-3) ?? 0;
  if (seconds >= 60 || (parts.length === 3 && minutes >= 60)) return null;
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

export function frameIndexForMs(ms: number, fps: number) {
  if (!Number.isFinite(ms) || !Number.isFinite(fps) || fps <= 0) return 0;
  return Math.max(0, Math.round((ms / 1000) * fps));
}

export function frameTimeMs(frame: number, fps: number) {
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) return 0;
  return (Math.max(0, Math.round(frame)) / fps) * 1000;
}

export function steppedFrameTimeMs(
  currentMs: number,
  fps: number,
  frameDelta: number,
  durationMs: number,
) {
  const lastFrame = frameIndexForMs(durationMs, fps);
  const nextFrame = Math.max(
    0,
    Math.min(lastFrame, frameIndexForMs(currentMs, fps) + Math.trunc(frameDelta)),
  );
  return frameTimeMs(nextFrame, fps);
}
