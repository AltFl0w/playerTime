"use client";

import type { Player } from "../types";
import { fmtClock } from "../lib/format";
import { Avatar } from "./bits";

export interface OutChip {
  player: Player;
  stintSec: number;
  playedSec: number;
  suggested: boolean;
  reason?: string;
  // Shield not yet met — the coach can still pull them, just dimmed as a nudge.
  fresh: boolean;
}

export interface InChip {
  player: Player;
  playedSec: number;
  suggested: boolean;
  reason?: string;
}

// SUGGESTED gets a "PICK" tag + reason even when the coach has tapped a
// different chip, so the engine's advice stays visible as a reference point.
function PickTag({ reason }: { reason?: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#2563eb]">Pick</span>
      {reason && <span className="truncate text-[9px] font-semibold uppercase text-neutral-400">{reason}</span>}
    </div>
  );
}

export function OutColumn({
  candidates,
  selectedId,
  onPick,
  compact,
  locked,
}: {
  candidates: OutChip[];
  selectedId: string | null;
  onPick: (id: string) => void;
  compact?: boolean;
  locked?: boolean;
}) {
  return (
    <div className={`min-w-0 ${locked ? "pointer-events-none opacity-50" : ""}`}>
      <div className="px-0.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400">off</div>
      {/* Suggested candidate sorts first (engine order), so it's always
          visible above the fold even once this scrolls past ~5 rows. */}
      <div
        className={`mt-1 flex flex-col gap-1.5 overflow-y-auto ${compact ? "max-h-[6.5rem]" : "max-h-[19rem]"}`}
      >
        {candidates.map((c) => {
          const selected = c.player.id === selectedId;
          return (
            <button
              type="button"
              key={c.player.id}
              onClick={() => onPick(c.player.id)}
              className={`flex min-h-[44px] w-full items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-left active:scale-[0.97] ${
                selected ? "bg-accenttint ring-2 ring-[#2563eb]/50" : "bg-[#f1f3f6]"
              } ${c.fresh ? "opacity-60" : ""}`}
            >
              <Avatar player={c.player} className={`h-7 w-7 ${c.fresh ? "grayscale" : ""}`} />
              <div className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-bold ${selected ? "text-[#2563eb]" : "text-[#1a1a1e]"}`}>
                  {c.player.name.split(" ")[0]}
                </span>
                <span className="block truncate text-[10px] font-semibold tabular-nums text-neutral-500">
                  {fmtClock(c.stintSec)}
                  <span className="text-neutral-400"> · {fmtClock(c.playedSec)}</span>
                </span>
                {c.suggested && <PickTag reason={c.reason} />}
                {c.fresh && <span className="text-[9px] font-bold uppercase text-neutral-400">fresh</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function InColumn({
  candidates,
  selectedId,
  onPick,
  compact,
  locked,
}: {
  candidates: InChip[];
  selectedId: string | null;
  onPick: (id: string) => void;
  compact?: boolean;
  locked?: boolean;
}) {
  return (
    <div className={`min-w-0 ${locked ? "pointer-events-none opacity-50" : ""}`}>
      <div className="px-0.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400">in</div>
      {/* Suggested candidate sorts first (engine order), so it's always
          visible above the fold even once this scrolls past ~5 rows. */}
      <div
        className={`mt-1 flex flex-col gap-1.5 overflow-y-auto ${compact ? "max-h-[6.5rem]" : "max-h-[19rem]"}`}
      >
        {candidates.map((c) => {
          const selected = c.player.id === selectedId;
          return (
            <button
              type="button"
              key={c.player.id}
              onClick={() => onPick(c.player.id)}
              className={`flex min-h-[44px] w-full items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-left active:scale-[0.97] ${
                selected ? "bg-accenttint ring-2 ring-[#2563eb]/50" : "bg-[#f1f3f6]"
              }`}
            >
              <Avatar player={c.player} className="h-7 w-7" />
              <div className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-bold ${selected ? "text-[#2563eb]" : "text-[#1a1a1e]"}`}>
                  {c.player.name.split(" ")[0]}
                </span>
                <span className="block truncate text-[10px] font-semibold tabular-nums text-neutral-500">
                  {fmtClock(c.playedSec)}
                </span>
                {c.suggested && <PickTag reason={c.reason} />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
