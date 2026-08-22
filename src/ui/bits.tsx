import type { ReactNode } from "react";
import type { Player } from "../types";

export type BadgeTone = "green" | "amber" | "red" | "grey" | "outline";

const badgeTones: Record<BadgeTone, string> = {
  green: "bg-green-600/20 text-green-300 ring-1 ring-green-500/60",
  amber: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/50",
  red: "bg-red-500/15 text-red-300 ring-1 ring-red-500/50",
  grey: "bg-neutral-800 text-neutral-500",
  outline: "bg-transparent text-neutral-400 ring-1 ring-neutral-700",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide whitespace-nowrap ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Avatar({ player, className }: { player: Player; className: string }) {
  if (player.photoDataUrl) {
    return (
      <img
        src={player.photoDataUrl}
        alt={player.name}
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    );
  }
  const initials =
    player.name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <div
      className={`${className} flex shrink-0 select-none items-center justify-center rounded-full bg-green-900 font-bold text-green-300`}
    >
      {initials}
    </div>
  );
}

const btnBase =
  "w-full rounded-2xl px-4 py-4 text-lg font-bold transition disabled:opacity-40 disabled:active:scale-100 active:scale-[0.98]";

export const btnPrimary = `${btnBase} bg-green-600 text-white shadow-lg shadow-green-900/50`;
export const btnGhost = `${btnBase} bg-neutral-800 text-neutral-200`;
export const btnDanger = `${btnBase} bg-red-900/60 text-red-200 ring-1 ring-red-700`;

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500">{children}</h2>
  );
}
