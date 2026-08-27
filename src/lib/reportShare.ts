import { fmtClock, fmtMinutes } from "./format";
import { formatReportText, type ReportSummary } from "./report";

const W = 1080;
const BG = "#ffffff";
const INK = "#1a1a1e";
const ACCENT = "#2563eb";
const MUTED = "#8b8a85";
const HAIRLINE = "#e7eaef";
const GREEN = "#16a34a";
const AMBER = "#d97706";
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

export type ShareReportResult = "shared-image" | "shared-text" | "copied" | "cancelled" | "unavailable";

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const trial = `${cur} ${words[i]}`;
    if (ctx.measureText(trial).width <= maxWidth) cur = trial;
    else {
      lines.push(cur);
      cur = words[i];
    }
  }
  lines.push(cur);
  return lines;
}

function fillTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
): void {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + tracking;
  }
}

function hairline(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, paint: boolean): void {
  if (!paint) return;
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
}

function renderCard(ctx: CanvasRenderingContext2D, summary: ReportSummary, paint: boolean): number {
  const x0 = 72;
  const x1 = W - 72;
  const maxW = x1 - x0;
  let y = 72;

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `700 20px ${FONT}`;
  ctx.fillStyle = ACCENT;
  const kicker = `PLAYERTIME · ${summary.formatLabel} · ${summary.elapsedLabel}`;
  if (paint) fillTracked(ctx, kicker, x0, y, 2.2);
  y += 52;

  ctx.font = `900 56px ${FONT}`;
  ctx.fillStyle = INK;
  const verdictLines = wrapLines(ctx, summary.verdict, maxW);
  for (const line of verdictLines) {
    if (paint) ctx.fillText(line, x0, y);
    y += 64;
  }

  if (summary.dateLine) {
    y += 4;
    ctx.font = `600 28px ${FONT}`;
    ctx.fillStyle = MUTED;
    if (paint) ctx.fillText(summary.dateLine, x0, y);
    y += 44;
  }

  y += 12;
  hairline(ctx, x0, x1, y, paint);
  y += 64;

  for (const row of summary.rows) {
    ctx.font = `900 52px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    if (paint) ctx.fillText(row.firstName || "Player", x0, y);
    ctx.textAlign = "right";
    if (paint) ctx.fillText(`${fmtMinutes(row.playedSec)} min`, x1, y);
    y += 38;

    const status = row.onTarget
      ? "on target"
      : `${row.deltaSec > 0 ? "+" : "−"}${fmtClock(Math.abs(row.deltaSec))}`;
    ctx.font = `800 22px ${FONT}`;
    ctx.fillStyle = row.onTarget ? MUTED : row.deltaSec > 0 ? GREEN : AMBER;
    if (paint) ctx.fillText(status, x1, y);
    y += 56;
  }

  if (summary.notes.length > 0) {
    y += 4;
    hairline(ctx, x0, x1, y, paint);
    y += 44;
    ctx.font = `600 24px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    for (const note of summary.notes) {
      for (const line of wrapLines(ctx, note, maxW)) {
        if (paint) ctx.fillText(line, x0, y);
        y += 34;
      }
    }
    y += 12;
  }

  y += 28;
  ctx.font = `700 20px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = "center";
  if (paint) ctx.fillText("PlayerTime", W / 2, y);
  y += 64;
  return y;
}

export function drawReportCard(summary: ReportSummary): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = 8;
  const measureCtx = canvas.getContext("2d");
  if (!measureCtx) throw new Error("2D canvas unavailable");
  const height = renderCard(measureCtx, summary, false);
  canvas.height = Math.max(1, Math.ceil(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  renderCard(ctx, summary, true);
  return canvas;
}

// Sync on purpose: toBlob is async and drops the iOS user-activation window
// that navigator.share needs in the same turn.
export function canvasToPngFile(canvas: HTMLCanvasElement): File {
  const dataUrl = canvas.toDataURL("image/png");
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], "playertime.png", { type: "image/png" });
}

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && (err as { name: string }).name === "AbortError";
}

function canShareSafe(data: ShareData): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare === "function") {
    try {
      return navigator.canShare(data);
    } catch {
      return false;
    }
  }
  // Without canShare, files are a guess; text share is the safe branch.
  return !data.files || data.files.length === 0;
}

async function copyText(text: string): Promise<ShareReportResult> {
  if (!navigator.clipboard?.writeText) return "unavailable";
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "unavailable";
  }
}

export async function shareReport(summary: ReportSummary): Promise<ShareReportResult> {
  if (typeof navigator === "undefined") return "unavailable";
  const text = formatReportText(summary);
  const hasDocument = typeof document !== "undefined";

  // SSR / no DOM: never touch canvas. Clipboard is the only fallback.
  if (!hasDocument) return copyText(text);

  let file: File | undefined;
  try {
    file = canvasToPngFile(drawReportCard(summary));
  } catch {
    file = undefined;
  }

  let payload: ShareData | null = null;
  let ok: ShareReportResult = "shared-text";
  if (file) {
    const withExtras: ShareData = { files: [file], title: "PlayerTime", text };
    const filesOnly: ShareData = { files: [file], title: "PlayerTime" };
    if (canShareSafe(withExtras)) {
      payload = withExtras;
      ok = "shared-image";
    } else if (canShareSafe(filesOnly)) {
      payload = filesOnly;
      ok = "shared-image";
    }
  }
  if (!payload) {
    const withTitle: ShareData = { title: "PlayerTime", text };
    if (canShareSafe(withTitle)) payload = withTitle;
    else if (canShareSafe({ text })) payload = { text };
    if (payload) ok = "shared-text";
  }

  if (payload) {
    try {
      await navigator.share(payload);
      return ok;
    } catch (err) {
      if (isAbortError(err)) return "cancelled";
    }
  }

  return copyText(text);
}
