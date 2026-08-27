"use client";

import type { Player } from "../types";
import { Avatar } from "./bits";
import { InColumn, OutColumn, type InChip, type OutChip } from "./SwapChips";

interface Props {
  title: string;
  subtitle?: string;
  outPlayer: Player | null;
  inPlayer: Player | null;
  outDone: boolean;
  inDone: boolean; // confirmed in OR refused
  onConfirmOut: () => void;
  onConfirmBoth: () => void;
  onConfirmIn: () => void;
  onRefuseIn: () => void;
  onDismiss: () => void;
  outCandidates: OutChip[];
  inCandidates: InChip[];
  onChangeOut: (id: string) => void;
  onChangeIn: (id: string) => void;
}

// Fullscreen takeover — for the ten seconds a sub takes, this IS the app.
// Photos are the hero; "Swapped!" covers the normal case in one tap.
export function SwapAlarmModal(p: Props) {
  const bothPending =
    !p.outDone && !p.inDone && !!p.outPlayer && !!p.inPlayer;
  const forced = p.title.toUpperCase().includes("FORCED");
  return (
    <div
      className="pt-alarm-modal fixed inset-0 z-50 flex flex-col items-center gap-3 overflow-hidden bg-white px-[max(1.5rem,env(safe-area-inset-left),env(safe-area-inset-right))] pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="text-center">
        <div
          className={`text-4xl font-black tracking-wide ${forced ? "animate-pulse text-red-600" : "text-[#2563eb]"}`}
        >
          {p.title}
        </div>
        {p.subtitle && (
          <div className="mt-1 text-base text-neutral-500">{p.subtitle}</div>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Side player={p.outPlayer} label="OFF" done={p.outDone} ring="ring-red-500" />
        <div className="text-4xl font-bold text-neutral-300">⇄</div>
        <Side player={p.inPlayer} label="IN" done={p.inDone} ring="ring-green-600" />
      </div>

      {(p.outCandidates.length > 0 || p.inCandidates.length > 0) && (
        <div className="grid w-full max-w-md grid-cols-2 gap-3">
          <OutColumn
            candidates={p.outCandidates}
            selectedId={p.outPlayer?.id ?? null}
            onPick={p.onChangeOut}
            compact
            locked={p.outDone}
          />
          <InColumn
            candidates={p.inCandidates}
            selectedId={p.inPlayer?.id ?? null}
            onPick={p.onChangeIn}
            compact
            locked={p.inDone}
          />
        </div>
      )}

      <div className="mt-auto flex w-full max-w-md flex-col gap-3">
        {bothPending && (
          <button type="button" onClick={p.onConfirmBoth} className={bigAccent}>
            Swapped!
          </button>
        )}
        {!bothPending && p.outPlayer && !p.outDone && (
          <button type="button" onClick={p.onConfirmOut} className={bigInk}>
            {p.outPlayer.name} went off
          </button>
        )}
        {!bothPending && p.inPlayer && !p.inDone && (
          <button type="button" onClick={p.onConfirmIn} className={bigInk}>
            {p.inPlayer.name} went in
          </button>
        )}
        {p.inPlayer && !p.inDone && (
          <button type="button" onClick={p.onRefuseIn} className={bigDanger}>
            {p.inPlayer.name.split(" ")[0]} won't go in
          </button>
        )}
        <button type="button" onClick={p.onDismiss} className="min-h-[44px] py-3 font-bold text-neutral-400">
          Not yet — dismiss
        </button>
      </div>
    </div>
  );
}

const bigInk =
  "w-full rounded-[7px] bg-[#1a1a1e] px-4 py-6 text-2xl font-extrabold text-white shadow-[0_2px_8px_rgba(26,26,30,0.18)] active:scale-[0.98] transition";
const bigAccent = `${bigInk} !bg-[#2563eb] shadow-[0_2px_12px_rgba(37,99,235,0.4)]`;
const bigDanger =
  "w-full rounded-[7px] bg-red-50 px-4 py-5 text-xl font-bold text-red-700 ring-1 ring-red-200 active:scale-[0.98] transition";

function Side({
  player,
  label,
  done,
  ring,
}: {
  player: Player | null;
  label: string;
  done: boolean;
  ring: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      {player ? (
        <>
          <Avatar
            player={player}
            className={`h-32 w-32 ${done ? "opacity-40 ring-4 ring-hairline" : `ring-4 ${ring}`}`}
          />
          <div className={`max-w-[10rem] truncate text-center text-2xl font-extrabold ${done ? "line-through opacity-50" : ""}`}>
            {player.name}
          </div>
          <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">
            {label}
          </div>
        </>
      ) : (
        <>
          <div className="flex h-32 w-32 items-center justify-center rounded-full bg-neutral-100 text-3xl text-neutral-300">
            ?
          </div>
          <div className="text-sm text-neutral-400">no suggestion</div>
        </>
      )}
    </div>
  );
}
