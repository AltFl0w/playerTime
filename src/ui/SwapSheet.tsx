"use client";

import type { Player } from "../types";
import { Avatar } from "./bits";
import { InColumn, OutColumn, type InChip, type OutChip } from "./SwapChips";

export type { OutChip, InChip } from "./SwapChips";

interface Props {
  outPlayer: Player | null;
  inPlayer: Player | null;
  outCandidates: OutChip[];
  inCandidates: InChip[];
  onChangeOut: (id: string) => void;
  onChangeIn: (id: string) => void;
  onSwapNow: () => void;
  onSchedule: (delayMin: number) => void;
  onRefuseIn: (id: string) => void;
  onCancel: () => void;
  onLeaveOut?: () => void;
  fieldFull: boolean;
}

// Tap-a-kid confirmation sheet from Field view. The engine pre-selects a
// pair, but a mid-game coach needs to override either side — the field
// changes shape too fast to be locked into one suggestion.
export function SwapSheet(props: Props) {
  const { outPlayer, inPlayer, outCandidates, inCandidates, fieldFull } = props;
  // One-sided actions are allowed (pull off with no replacement, or send in to
  // an open slot) — but an IN with no OUT on a full field would overfill past
  // playersOnField, so that one is blocked until someone is picked to come off.
  const inBlocked = !outPlayer && !!inPlayer && fieldFull;
  const canAct = (!!outPlayer || !!inPlayer) && !inBlocked;
  const bothPresent = !!outPlayer && !!inPlayer;
  const swapLabel = bothPresent
    ? "Swap now"
    : outPlayer
      ? "Pull off — play short"
      : inBlocked
        ? "Pick who comes off"
        : inPlayer
          ? "Send in"
          : "Swap now";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1a1a1e]/40 p-4 pb-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md rounded-[7px] bg-white p-4 shadow-2xl">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Side player={outPlayer} label="OFF" ring="ring-red-500" />
          <div className="text-2xl text-neutral-300">⇄</div>
          <Side player={inPlayer} label="IN" ring="ring-green-600" />
        </div>

        {/* Side-by-side columns mirror the OFF ⇄ IN pair above, so the coach
            scans one column per side instead of skipping through a mixed row. */}
        {(outCandidates.length > 0 || inCandidates.length > 0) && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <OutColumn candidates={outCandidates} selectedId={outPlayer?.id ?? null} onPick={props.onChangeOut} />
            <InColumn candidates={inCandidates} selectedId={inPlayer?.id ?? null} onPick={props.onChangeIn} />
          </div>
        )}

        <button
          type="button"
          onClick={props.onSwapNow}
          disabled={!canAct}
          className="mt-3 w-full rounded-[7px] bg-[#2563eb] px-4 py-3 text-lg font-extrabold text-white shadow-[0_2px_10px_rgba(37,99,235,0.35)] transition active:scale-[0.98] disabled:opacity-40"
        >
          {swapLabel}
        </button>

        {inPlayer && (
          <button
            type="button"
            onClick={() => props.onRefuseIn(inPlayer.id)}
            className="mt-2 min-h-[44px] w-full rounded-[7px] bg-red-50 px-3 py-2 text-sm font-bold text-red-700 ring-1 ring-red-200 transition active:scale-[0.98]"
          >
            {inPlayer.name.split(" ")[0]} won't go in
          </button>
        )}

        <div className="mt-2 flex flex-col gap-1">
          <div className="px-0.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
            or swap later
          </div>
          <div className="flex gap-2">
            {[1, 2, 3].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => props.onSchedule(m)}
                disabled={!bothPresent}
                className="flex-1 rounded-[7px] bg-neutral-100 px-2 py-2.5 text-sm font-bold text-[#1a1a1e] transition active:scale-[0.98] disabled:opacity-40"
              >
                in {m} min
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={props.onCancel}
          className="min-h-[44px] w-full py-2 pt-2 text-sm font-bold text-neutral-400"
        >
          Cancel
        </button>
        {props.onLeaveOut && outPlayer && (
          <button
            type="button"
            onClick={props.onLeaveOut}
            className="min-h-[44px] w-full py-2 text-sm font-bold text-neutral-400"
          >
            {outPlayer.name.split(" ")[0]} leaves game
          </button>
        )}
      </div>
    </div>
  );
}

function Side({
  player,
  label,
  ring,
}: {
  player: Player | null;
  label: string;
  ring: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      {player ? (
        <>
          <Avatar player={player} className={`h-20 w-20 ring-4 ${ring}`} />
          <div className="max-w-[7.5rem] truncate text-center text-lg font-extrabold">
            {player.name.split(" ")[0]}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            {label}
          </div>
        </>
      ) : (
        <>
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-neutral-100 text-2xl text-neutral-300">
            ?
          </div>
          <div className="text-xs text-neutral-400">no suggestion</div>
        </>
      )}
    </div>
  );
}
