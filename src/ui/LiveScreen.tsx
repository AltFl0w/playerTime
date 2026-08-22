import { useState } from "react";
import { engine } from "../engine";
import type { GameConfig, GameState, Player, PlayerTimeState } from "../types";
import type { PendingSwap } from "../store";
import { fmtClock } from "../lib/format";
import { Avatar, Badge, SectionTitle, btnGhost, btnPrimary, type BadgeTone } from "./bits";
import { SwapSheet } from "./SwapSheet";

interface Props {
  roster: Player[];
  config: GameConfig;
  state: GameState;
  elapsedSec: number;
  clockRunning: boolean;
  pendingSwaps: PendingSwap[];
  onPauseToggle: () => void;
  onEnd: () => void;
  onSubOut: (id: string) => void;
  onSubIn: (id: string) => void;
  onMarkReady: (id: string) => void;
  onSetAvailability: (id: string, available: boolean) => void;
  onScheduleSwap: (outId: string, inId: string, delayMin: number) => void;
  onCancelPending: (id: string) => void;
}

type Row = { p: Player; st: PlayerTimeState };

function sortKey(row: Row, nextInId: string | null): number {
  const { st, p } = row;
  if (st.onField && st.availability === "available") return 0;
  if (st.availability === "declined_wait") return 3;
  if (st.availability === "inactive") return 4;
  if (p.id === nextInId) return 1;
  return 2;
}

function statusOf(row: Row, nextInId: string | null): { label: string; tone: BadgeTone } {
  const { st, p } = row;
  if (st.availability === "inactive") return { label: "inactive", tone: "grey" };
  if (st.availability === "declined_wait") return { label: "declined wait", tone: "red" };
  if (st.onField) return { label: "on field", tone: "green" };
  if (p.id === nextInId) return { label: "next up", tone: "amber" };
  return { label: "waiting", tone: "outline" };
}

function stintFrac(st: PlayerTimeState, config: GameConfig): number {
  return st.currentStintSec / Math.max(1, config.maxStintSec);
}

// Heat ring for field circles: green -> amber -> red pulsing at cap.
function stintRing(st: PlayerTimeState, config: GameConfig): string {
  const frac = stintFrac(st, config);
  if (frac >= 1) return "ring-4 ring-red-500 animate-pulse";
  if (frac >= 0.75) return "ring-4 ring-amber-400";
  return "ring-4 ring-[#1a1a1e]";
}

export function LiveScreen({
  roster,
  config,
  state,
  elapsedSec,
  clockRunning,
  pendingSwaps,
  onPauseToggle,
  onEnd,
  onSubOut,
  onSubIn,
  onMarkReady,
  onSetAvailability,
  onScheduleSwap,
  onCancelPending,
}: Props) {
  const [view, setView] = useState<"field" | "list">("field");
  // Swap sheet: pre-decided pair awaiting timing confirmation.
  const [sheet, setSheet] = useState<{ outId: string | null; inId: string | null } | null>(null);
  // Ready flow: which recovered kid we're picking an OUT for, then scheduling.
  const [pickOutFor, setPickOutFor] = useState<string | null>(null);
  const [schedOutId, setSchedOutId] = useState<string | null>(null);

  const byId = new Map(roster.map((p) => [p.id, p]));
  const rows: Row[] = [];
  for (const p of roster) {
    const st = state.players[p.id];
    if (st) rows.push({ p, st });
  }

  const declinedKids = rows.filter((r) => r.st.availability === "declined_wait");
  const nextInId = engine.suggestIn(state, config);
  const sortedRows = [...rows].sort((a, b) => sortKey(a, nextInId) - sortKey(b, nextInId));

  const onFieldRows = sortedRows.filter(
    ({ st }) => st.onField && st.availability === "available",
  );
  const waitingRows = sortedRows.filter(
    ({ p, st }) =>
      !st.onField && st.availability === "available" && p.id !== sheet?.inId,
  );

  const candidates =
    pickOutFor !== null
      ? engine.rankOutCandidates(state, config).filter((c) => state.players[c.playerId]?.onField)
      : [];
  const pickPlayer = pickOutFor ? byId.get(pickOutFor) ?? null : null;
  const schedPlayer = schedOutId ? byId.get(schedOutId) ?? null : null;

  const subCountdown = fmtClock(
    Math.max(0, (Math.floor(elapsedSec / config.subIntervalSec) + 1) * config.subIntervalSec - elapsedSec),
  );

  function startReadyFlow(id: string) {
    onMarkReady(id);
    setPickOutFor(id);
    setSchedOutId(null);
  }

  function closeFlows() {
    setPickOutFor(null);
    setSchedOutId(null);
    setSheet(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header: clock + countdown + view toggle */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">clock</div>
          <div className="text-6xl font-black leading-none tabular-nums">{fmtClock(elapsedSec)}</div>
          <div className={`mt-1 text-sm font-bold tabular-nums ${clockRunning ? "text-[#ea580c]" : "text-amber-600"}`}>
            {clockRunning ? `next sub ${subCountdown}` : "PAUSED"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex overflow-hidden rounded-xl bg-white ring-1 ring-hairline text-sm font-bold">
            <button
              type="button"
              onClick={() => setView("field")}
              className={view === "field" ? "bg-[#1a1a1e] px-3 py-2 text-white" : "px-3 py-2 text-neutral-400"}
            >
              ⚽
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={view === "list" ? "bg-[#1a1a1e] px-3 py-2 text-white" : "px-3 py-2 text-neutral-400"}
            >
              ☰
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onPauseToggle}
              className={`rounded-xl px-5 py-2 text-base font-bold ${
                clockRunning ? "bg-white text-[#1a1a1e] ring-1 ring-hairline" : "bg-[#1a1a1e] text-white"
              }`}
            >
              {clockRunning ? "⏸" : "▶"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("End the game and show the report?")) onEnd();
              }}
              className="rounded-xl bg-red-50 px-5 py-2 text-base font-bold text-red-700 ring-1 ring-red-200"
            >
              END
            </button>
          </div>
        </div>
      </div>

      {/* Pending swaps with countdown */}
      {pendingSwaps.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Scheduled swaps</SectionTitle>
          {pendingSwaps.map((ps) => {
            const remain = ps.dueElapsedSec - elapsedSec;
            const out = byId.get(ps.outPlayerId);
            const inn = byId.get(ps.inPlayerId);
            const ghost = (p: Player | undefined): Player => p ?? { id: "?", name: "?" };
            return (
              <div
                key={ps.id}
                className={`flex items-center gap-3 rounded-2xl p-3 ring-1 ${
                  remain <= 0
                    ? "animate-pulse bg-[#ffedd5] ring-2 ring-[#ea580c]/40"
                    : "bg-white ring-hairline"
                }`}
              >
                <Avatar player={ghost(out)} className="h-10 w-10" />
                <span className="text-lg text-neutral-500">⇄</span>
                <Avatar player={ghost(inn)} className="h-10 w-10" />
                <div className="min-w-0 flex-1 truncate text-lg font-bold">
                  {out?.name ?? "?"} ⇄ {inn?.name ?? "?"}
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-extrabold tabular-nums ${
                    remain <= 0 ? "bg-[#ea580c] text-white" : "bg-neutral-100 text-[#ea580c]"
                  }`}
                >
                  {remain <= 0 ? "NOW" : fmtClock(remain)}
                </span>
                <button
                  type="button"
                  onClick={() => onCancelPending(ps.id)}
                  aria-label="Cancel scheduled swap"
                  className="px-2 text-lg text-neutral-500"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </section>
      )}

      {/* Ready buttons for kids in declined_wait */}
      {declinedKids.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Waiting to come back</SectionTitle>
          {declinedKids.map(({ p }) => (
            <button
              type="button"
              key={p.id}
              onClick={() => startReadyFlow(p.id)}
              disabled={pickOutFor !== null}
              className="flex items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-[0_1px_3px_rgba(26,26,30,0.06)] ring-1 ring-red-200 disabled:opacity-40"
            >
              <Avatar player={p} className="h-12 w-12" />
              <div className="min-w-0 flex-1 truncate text-lg font-bold">{p.name}</div>
              <span className="rounded-full bg-[#ea580c] px-5 py-2 text-sm font-extrabold uppercase text-white">
                Ready
              </span>
            </button>
          ))}
        </section>
      )}

      {/* Ready flow — rank OUT candidates for a kid who just came back */}
      {pickOutFor !== null && schedOutId === null && (
        <section className="flex flex-col gap-2 rounded-3xl bg-white p-4 ring-2 ring-[#ea580c]/30">
          <SectionTitle>
            {pickPlayer ? `${pickPlayer.name} is ready — who comes out?` : "Who comes out?"}
          </SectionTitle>
          {candidates.length === 0 && <p className="py-2 text-neutral-400">Nobody is on the field yet.</p>}
          {candidates.map((c) => {
            const st = state.players[c.playerId];
            const p = byId.get(c.playerId);
            if (!st || !p) return null;
            const ratioPct = Number.isFinite(st.ratio) ? `${Math.round(st.ratio * 100)}%` : "—";
            return c.eligible ? (
              <button
                type="button"
                key={c.playerId}
                onClick={() => setSchedOutId(c.playerId)}
                className="flex items-center gap-3 rounded-2xl bg-[#f7f6f0] p-3 text-left"
              >
                <Avatar player={p} className="h-12 w-12" />
                <div className="min-w-0 flex-1 truncate text-lg font-bold">{p.name}</div>
                <Badge tone="amber">{ratioPct} of target</Badge>
              </button>
            ) : (
              <div
                key={c.playerId}
                className="flex items-center gap-3 rounded-2xl bg-neutral-100 p-3 opacity-60 ring-1 ring-hairline"
              >
                <Avatar player={p} className="h-12 w-12 grayscale" />
                <div className="min-w-0 flex-1 truncate text-lg font-bold text-neutral-400">{p.name}</div>
                <span className="text-sm text-neutral-500">fresh</span>
              </div>
            );
          })}
          <button type="button" onClick={closeFlows} className={btnGhost}>
            Cancel
          </button>
        </section>
      )}

      {pickOutFor !== null && schedOutId !== null && schedPlayer && pickPlayer && (
        <section className="flex flex-col gap-3 rounded-3xl bg-white p-4 ring-2 ring-[#ea580c]/30">
          <SectionTitle>
            Pull {schedPlayer.name} · put in {pickPlayer.name}
          </SectionTitle>
          {[0, 1, 2, 3, 5].map((mins) => (
            <button
              type="button"
              key={mins}
              onClick={() => {
                onScheduleSwap(schedOutId, pickOutFor, mins);
                closeFlows();
              }}
              className={btnPrimary}
            >
              {mins === 0 ? "Swap NOW" : `+${mins} min`}
            </button>
          ))}
          <button type="button" onClick={() => setSchedOutId(null)} className={btnGhost}>
            Back
          </button>
        </section>
      )}

      {/* FIELD VIEW */}
      {view === "field" && (
        <div className="flex flex-col items-center gap-6 pt-2">
          <section className="w-full">
            <SectionTitle>On field</SectionTitle>
            <div className="mt-2 grid grid-cols-4 justify-items-center gap-2">
              {Array.from({ length: Math.max(4, onFieldRows.length) }).map((_, i) => {
                const row = onFieldRows[i];
                if (!row)
                  return (
                    <div
                      key={`empty-${i}`}
                      className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-neutral-300 text-2xl text-neutral-300"
                    >
                      +
                    </div>
                  );
                return (
                  <button
                    type="button"
                    key={row.p.id}
                    onClick={() =>
                      setSheet({ outId: row.p.id, inId: engine.suggestIn(state, config) })
                    }
                    className="flex flex-col items-center gap-1 active:scale-[0.97]"
                  >
                    <Avatar player={row.p} className={`h-20 w-20 sm:h-24 sm:w-24 ${stintRing(row.st, config)}`} />
                    <span className="max-w-[5.5rem] truncate text-sm font-extrabold">
                      {row.p.name.split(" ")[0]}
                    </span>
                    <span className={`text-[11px] font-bold tabular-nums ${stintFrac(row.st, config) >= 0.75 ? "text-amber-300" : "text-neutral-500"}`}>
                      {fmtClock(row.st.currentStintSec)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="w-full">
            <SectionTitle>Next up — tap to swap in</SectionTitle>
            <div className="mt-2 grid grid-cols-4 justify-items-center gap-2">
              {waitingRows.slice(0, 4).map(({ p }) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setSheet({ outId: engine.suggestOut(state, config), inId: p.id })}
                  className="flex flex-col items-center gap-1 active:scale-[0.97]"
                >
                  <Avatar
                    player={p}
                    className={`h-16 w-16 ${p.id === nextInId ? "ring-4 ring-[#ea580c]" : "opacity-75 ring-2 ring-hairline"}`}
                  />
                  <span className="max-w-[5.5rem] truncate text-sm font-bold text-neutral-500">
                    {p.name.split(" ")[0]}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <p className="text-center text-xs text-neutral-600">
            tap a green kid to pull · tap an amber kid to send in
          </p>
        </div>
      )}

      {/* LIST VIEW — halftime management */}
      {view === "list" && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Squad</SectionTitle>
          {sortedRows.map(({ p, st }) => {
            const status = statusOf({ p, st }, nextInId);
            const showStint = st.onField && st.availability === "available";
            const frac = stintFrac(st, config);
            return (
              <div
                key={p.id}
                className={`rounded-2xl bg-white p-3 shadow-[0_1px_3px_rgba(26,26,30,0.06)] ${st.availability === "inactive" ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <Avatar player={p} className="h-14 w-14" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-bold">
                      {p.name}
                      {p.number !== undefined && (
                        <span className="ml-1.5 text-sm font-normal text-neutral-500">#{p.number}</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm tabular-nums text-neutral-400">
                      {fmtClock(st.playedSec)} / {fmtClock(st.targetSec)} min
                      {showStint && <> · stint {fmtClock(st.currentStintSec)}</>}
                    </div>
                  </div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                {showStint && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hairline">
                    <div
                      className={`h-full rounded-full ${frac >= 1 ? "animate-pulse bg-red-500" : frac >= 0.75 ? "bg-amber-400" : "bg-green-600"}`}
                      style={{ width: `${Math.min(100, frac * 100)}%` }}
                    />
                  </div>
                )}
                <div className="mt-2 flex justify-end gap-2">
                  {st.availability === "available" && !st.onField && (
                    <button
                      type="button"
                      onClick={() => onSubIn(p.id)}
                      className="rounded-lg bg-green-50 px-3 py-2 text-sm font-bold text-green-700 ring-1 ring-green-200"
                    >
                      ▶ Sub in now
                    </button>
                  )}
                  {st.onField && (
                    <button
                      type="button"
                      onClick={() => onSubOut(p.id)}
                      className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-bold text-[#1a1a1e]"
                    >
                      Sub out
                    </button>
                  )}
                  {st.availability === "available" && !st.onField && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Take ${p.name} out of the game (injury/leaving)?`))
                          onSetAvailability(p.id, false);
                      }}
                      className="rounded-lg px-3 py-2 text-sm font-bold text-neutral-500"
                    >
                      Leave game
                    </button>
                  )}
                  {st.availability === "inactive" && (
                    <button
                      type="button"
                      onClick={() => onSetAvailability(p.id, true)}
                      className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-bold text-green-700"
                    >
                      Arrived — add to game
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Tap-a-kid swap confirmation */}
      {sheet && (
        <SwapSheet
          outPlayer={sheet.outId ? byId.get(sheet.outId) ?? null : null}
          inPlayer={sheet.inId ? byId.get(sheet.inId) ?? null : null}
          onSwapNow={() => {
            if (sheet.outId) onSubOut(sheet.outId);
            if (sheet.inId) onSubIn(sheet.inId);
            closeFlows();
          }}
          onSchedule={(m) => {
            if (sheet.outId && sheet.inId) onScheduleSwap(sheet.outId, sheet.inId, m);
            closeFlows();
          }}
          onCancel={closeFlows}
        />
      )}
    </div>
  );
}
