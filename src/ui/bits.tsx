import type { ReactNode } from "react";
import type { Player } from "../types";

export type BadgeTone = "green" | "amber" | "red" | "grey" | "accent" | "outline";

const badgeTones: Record<BadgeTone, string> = {
  green: "bg-green-50 text-green-700 ring-1 ring-green-200",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-1 ring-red-200",
  grey: "bg-neutral-100 text-neutral-400",
  accent: "bg-accenttint text-accent ring-1 ring-accent/30",
  outline: "bg-transparent text-neutral-400 ring-1 ring-hairline",
};

// Pills are for status only — never decorative.
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${badgeTones[tone]}`}
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
      className={`${className} flex shrink-0 select-none items-center justify-center rounded-full bg-[#eae8de] font-extrabold text-[#6b6960]`}
    >
      {initials}
    </div>
  );
}

const btnBase =
  "w-full rounded-2xl px-4 py-4 text-lg font-bold transition active:scale-[0.98] disabled:opacity-40";

// Primary CTA: solid ink, the one element allowed a visible shadow.
export const btnPrimary = `${btnBase} bg-[#1a1a1e] text-white shadow-[0_2px_8px_rgba(26,26,30,0.18)]`;

export const btnGhost = `${btnBase} bg-white text-[#1a1a1e] ring-1 ring-hairline`;

export const btnDanger = `${btnBase} bg-red-50 text-red-700 ring-1 ring-red-200`;

export const btnAccent = `${btnBase} bg-[#ea580c] text-white shadow-[0_2px_10px_rgba(234,88,12,0.35)]`;

// Small uppercase labels — tracked for scanning, not styled into wallpaper.
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400">{children}</h2>;
}
