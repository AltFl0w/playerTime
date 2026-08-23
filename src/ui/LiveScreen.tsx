import { useState } from "react";
import { engine } from "../engine";
import type { GameConfig, GameState, Player, PlayerTimeState } from "../types";
import type { PendingSwap } from "../store";
import { fmtClock } from "../lib/format";
import { Avatar, Badge, SectionTitle, btnAccent, type BadgeTone } from "./bits";
import { SwapSheet } from "./SwapSheet";
import { ConfirmSheet } from "./ConfirmSheet";

interface Props {
  roster: Player[];
  config: GameConfig;
  state: GameState;
  elapsedSec: number;
  clockRunning: boolean;
  quarter: number;
  atBreak: boolean;
  isFinalBreak: boolean;
  pendingSwaps: PendingSwap[];
  onPauseToggle: () => void;
  onEnd: () => void;
  onSubOut: (id: string) => void;
  onSubIn: (id: string) => void;
  onMarkReady: (id: string) => void;
  onSetAvailability: (id: string, available: boolean) => void;
  onScheduleSwap: (outId: string, inId: string, delayMin: number) => void;
  onCancelPending: (id: string) => void;
  onFirePending: (id: string) => void;
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

// Donut gauge around a kid's photo — stint progress toward the heat cap.
// Ink arc normally; amber near cap; red pulsing at cap. Attention only.
function KidGauge({
  frac,
  player,
}: {
  frac: number;
  player: Player;
}) {
  const clamped = Math.min(1, Math.max(0, frac));
  const R = 33;
  const C = 2 * Math.PI * R;
  const color =
    clamped >= 1 ? "#dc2626" : clamped >= 0.75 ? "#f59e0b" : "#1a1a1e";
  return (
    <div className={`relative h-16 w-16 shrink-0 ${clamped >= 1 ? "animate-pulse" : ""}`}>
      <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
        <circle cx="42" cy="42" r={R} fill="none" stroke="#e7e4db" strokeWidth="5" />
        {clamped > 0 && (
          <circle
            cx="42"
            cy="42"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${C * clamped} ${C}`}
          />
        )}
      </svg>
      <Avatar player={player} className="absolute inset-[7px] h-[50px] w-[50px]" />
    </div>
  );
}

export function LiveScreen({
  roster,
  config,
  state,
  elapsedSec,
  clockRunning,
  quarter,
  atBreak,
  isFinalBreak,
  pendingSwaps,
  onPauseToggle,
  onEnd,
  onSubOut,
  onSubIn,
  onMarkReady,
  onSetAvailability,
  onScheduleSwap,
  onCancelPending,
  onFirePending,
}: Props) {
  const [view, setView] = useState<"field" | "list">("field");
  // Swap sheet: pre-decided pair awaiting timing confirmation.
  const [sheet, setSheet] = useState<{ outId: string | null; inId: string | null } | null>(null);
  // Ready flow: which recovered kid we're scheduling back in, and which OUT
  // candidate is currently selected (defaults to the engine's top pick).
  const [pickOutFor, setPickOutFor] = useState<string | null>(null);
  const [schedOutId, setSchedOutId] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmLeaveId, setConfirmLeaveId] = useState<string | null>(null);

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

  // MARK_READY fires only once a swap is actually confirmed/scheduled (see
  // scheduleReadySwap) — not here — so cancelling this flow leaves the kid in
  // declined_wait instead of silently marking them ready.
  function startReadyFlow(id: string) {
    const topOut = engine
      .rankOutCandidates(state, config)
      .find((c) => c.eligible && state.players[c.playerId]?.onField);
    setPickOutFor(id);
    setSchedOutId(topOut?.playerId ?? null);
  }

  function scheduleReadySwap(delayMin: number) {
    if (!pickOutFor || !schedOutId) return;
    onMarkReady(pickOutFor);
    onScheduleSwap(schedOutId, pickOutFor, delayMin);
    closeFlows();
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
          <div className={`mt-1 text-sm font-bold tabular-nums ${clockRunning ? "text-[#2563eb]" : "text-amber-600"}`}>
            {clockRunning ? `Q${quarter} · next sub ${subCountdown}` : atBreak ? `quarter ${quarter} over` : "PAUSED"}
          </div>
        </div>
        <div className="flex overflow-hidden rounded-[7px] bg-white ring-1 ring-hairline text-sm font-bold">
          <button
            type="button"
            onClick={() => setView("field")}
            className={view === "field" ? "bg-[#1a1a1e] px-3 py-2 text-white" : "px-3 py-2 text-neutral-400"}
          >
            Field
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={view === "list" ? "bg-[#1a1a1e] px-3 py-2 text-white" : "px-3 py-2 text-neutral-400"}
          >
            List
          </button>
        </div>
      </div>

      {/* Quarter / water break */}
      {atBreak && (
        <section className="rounded-[7px] bg-white p-5 text-center shadow-[0_1px_3px_rgba(26,26,30,0.06)]">
          <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            {isFinalBreak ? "full time" : `end of quarter ${quarter}`}
          </div>
          <div className="mt-0.5 text-2xl font-black">
            {isFinalBreak ? "Great game, coach" : "Water break"}
          </div>
          <div className="mt-0.5 text-sm text-neutral-500">
            clock + stint timers are frozen
          </div>
          {isFinalBreak ? (
            <button
              type="button"
              onClick={onEnd}
              className="mt-3 w-full rounded-[7px] bg-[#2563eb] px-4 py-3 text-lg font-extrabold text-white shadow-[0_2px_10px_rgba(37,99,235,0.35)] active:scale-[0.98]"
            >
              See report
            </button>
          ) : (
            <button
              type="button"
              onClick={onPauseToggle}
              className="mt-3 w-full rounded-[7px] bg-[#2563eb] px-4 py-3 text-lg font-extrabold text-white shadow-[0_2px_10px_rgba(37,99,235,0.35)] active:scale-[0.98]"
            >
              Start Q{quarter + 1}
            </button>
          )}
        </section>
      )}

      {/* Pending swaps with countdown */}
      {pendingSwaps.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Scheduled swaps</SectionTitle>
          {pendingSwaps.map((ps) => {
            const remain = ps.dueElapsedSec - elapsedSec;
            const out = byId.get(ps.outPlayerId);
            const inn = byId.get(ps.inPlayerId);
            const ghost = (p: Player | undefined): Player => p ?? { id: "?", name: "?" };
            const due = remain <= 0;
            return (
              <div
                key={ps.id}
                role={due ? "button" : undefined}
                tabIndex={due ? 0 : undefined}
                onClick={due ? () => onFirePending(ps.id) : undefined}
                onKeyDown={
                  due
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") onFirePending(ps.id);
                      }
                    : undefined
                }
                className={`flex w-full items-center gap-2 rounded-[7px] px-2.5 py-2 text-left ring-1 ${
                  due
                    ? "animate-pulse bg-[#e8f0fe] ring-2 ring-[#2563eb]/40 active:scale-[0.98]"
                    : "bg-white ring-hairline"
                }`}
              >
                <Avatar player={ghost(out)} className="h-8 w-8" />
                <span className="text-sm text-neutral-500">⇄</span>
                <Avatar player={ghost(inn)} className="h-8 w-8" />
                <div className="min-w-0 flex-1 truncate text-base font-bold">
                  {out?.name ?? "?"} ⇄ {inn?.name ?? "?"}
                </div>
                <span
                  className={`rounded-[7px] px-3 py-1 text-sm font-extrabold tabular-nums ${
                    due ? "bg-[#2563eb] text-white" : "bg-neutral-100 text-[#2563eb]"
                  }`}
                >
                  {due ? "NOW" : fmtClock(remain)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelPending(ps.id);
                  }}
                  aria-label="Cancel scheduled swap"
                  className="-mr-1 p-3 text-lg text-neutral-500"
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
              className="flex items-center gap-2 rounded-[7px] bg-white px-2.5 py-2 text-left shadow-[0_1px_3px_rgba(26,26,30,0.06)] ring-1 ring-red-200 disabled:opacity-40"
            >
              <Avatar player={p} className="h-9 w-9" />
              <div className="min-w-0 flex-1 truncate text-base font-bold">{p.name.split(" ")[0]}</div>
              <span className="rounded-[7px] bg-[#2563eb] px-3.5 py-1.5 text-xs font-extrabold uppercase text-white">Ready</span>
            </button>
          ))}
        </section>
      )}

      {/* Ready flow — leads with the engine's top OUT pick as a one-tap swap;
          the full candidate grid + timing options sit below as the fallback
          for when the coach wants someone else or a delayed swap. */}
      {pickOutFor !== null && pickPlayer && (
        <section className="flex flex-col gap-3 rounded-[7px] bg-white p-4 ring-2 ring-[#2563eb]/30">
          <SectionTitle>{pickPlayer.name} is ready</SectionTitle>

          {schedPlayer ? (
            <button type="button" onClick={() => scheduleReadySwap(0)} className={btnAccent}>
              Swap now — pull {schedPlayer.name.split(" ")[0]}
            </button>
          ) : (
            <p className="py-1 text-neutral-400">Nobody is on the field yet.</p>
          )}

          <div className="flex flex-col gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              or choose who comes out
            </div>
            <div className="grid grid-cols-2 gap-2">
              {candidates.map((c) => {
                const st = state.players[c.playerId];
                const p = byId.get(c.playerId);
                if (!st || !p) return null;
                const ratioPct = Number.isFinite(st.ratio) ? `${Math.round(st.ratio * 100)}%` : "—";
                const selected = c.playerId === schedOutId;
                return c.eligible ? (
                  <button
                    type="button"
                    key={c.playerId}
                    onClick={() => setSchedOutId(c.playerId)}
                    className={`flex items-center gap-2 rounded-[7px] px-2 py-2 text-left active:scale-[0.97] ${
                      selected ? "bg-accenttint ring-2 ring-[#2563eb]/50" : "bg-[#f1f3f6]"
                    }`}
                  >
                    <Avatar player={p} className="h-9 w-9" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{p.name.split(" ")[0]}</div>
                      <div className="text-[10px] font-bold uppercase text-[#2563eb]">{ratioPct}</div>
                    </div>
                  </button>
                ) : (
                  <div
                    key={c.playerId}
                    className="flex items-center gap-2 rounded-[7px] bg-neutral-100 px-2 py-2 opacity-60"
                  >
                    <Avatar player={p} className="h-9 w-9 grayscale" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-neutral-400">{p.name.split(" ")[0]}</div>
                      <div className="text-[10px] font-bold uppercase text-neutral-400">fresh</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {schedPlayer && (
            <div className="flex gap-2">
              {[1, 2, 3, 5].map((mins) => (
                <button
                  type="button"
                  key={mins}
                  onClick={() => scheduleReadySwap(mins)}
                  className="min-h-[44px] flex-1 rounded-[7px] bg-neutral-100 px-2 py-2.5 text-sm font-bold text-[#1a1a1e] active:scale-[0.98]"
                >
                  +{mins} min
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={closeFlows}
            className="min-h-[44px] py-2 text-sm font-bold text-neutral-400"
          >
            Cancel
          </button>
        </section>
      )}

      {/* FIELD VIEW — quick reference: who's on, how cooked, who's next */}
      {view === "field" && (
        <div className="flex flex-col gap-5 pt-1">
          <section className="rounded-[7px] bg-white p-4 shadow-[0_1px_3px_rgba(26,26,30,0.06)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-extrabold">On field</h2>
              {clockRunning ? (
                <span className="rounded-[7px] bg-accenttint px-3 py-1 text-sm font-extrabold tabular-nums text-[#2563eb]">
                  next sub {subCountdown}
                </span>
              ) : (
                <span className="rounded-[7px] bg-amber-50 px-3 py-1 text-sm font-extrabold text-amber-700">
                  paused
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: Math.max(config.playersOnField, onFieldRows.length) }).map((_, i) => {
                const row = onFieldRows[i];
                if (!row)
                  return (
                    <div
                      key={`empty-${i}`}
                      className="flex items-center gap-3 rounded-[7px] bg-[#f1f3f6] px-3 py-2"
                    >
                      <div className="flex h-[50px] w-[50px] items-center justify-center rounded-full border-2 border-dashed border-neutral-300 text-xl text-neutral-300">
                        +
                      </div>
                      <span className="text-sm font-bold text-neutral-300">open</span>
                    </div>
                  );
                const hot = stintFrac(row.st, config) >= 0.75;
                return (
                  <button
                    type="button"
                    key={row.p.id}
                    onClick={() =>
                      setSheet({ outId: row.p.id, inId: engine.suggestIn(state, config) })
                    }
                    className="flex items-center gap-3 rounded-[7px] bg-[#f1f3f6] px-3 py-2 text-left active:scale-[0.97]"
                  >
                    <KidGauge frac={stintFrac(row.st, config)} player={row.p} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-extrabold leading-tight">
                        {row.p.name.split(" ")[0]}
                      </div>
                      <div
                        className={`text-[13px] font-bold leading-snug tabular-nums ${hot ? "text-amber-600" : "text-neutral-700"}`}
                      >
                        {fmtClock(row.st.currentStintSec)}
                      </div>
                      <div className="text-[11px] font-semibold leading-snug tabular-nums text-neutral-500">
                        {fmtClock(row.st.playedSec)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <SectionTitle>Next up</SectionTitle>
              <span className="text-xs text-neutral-400">tap to send in</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {waitingRows.map(({ p, st }) => {
                const isNext = p.id === nextInId;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() =>
                      setSheet({ outId: engine.suggestOut(state, config), inId: p.id })
                    }
                    className={`flex items-center gap-2.5 rounded-[7px] py-1.5 pl-2.5 pr-4 active:scale-[0.97] ${
                      isNext ? "bg-accenttint ring-2 ring-[#2563eb]/50" : "bg-white ring-1 ring-hairline"
                    }`}
                  >
                    <Avatar player={p} className="h-10 w-10" />
                    <div className="min-w-0 flex-1 text-left">
                      <div className={`truncate text-base font-bold leading-tight ${isNext ? "text-[#2563eb]" : "text-[#1a1a1e]"}`}>
                        {p.name.split(" ")[0]}
                      </div>
                      <div className="text-[11px] font-semibold tabular-nums text-neutral-500">
                        {fmtClock(st.playedSec)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <p className="pb-2 text-center text-xs text-neutral-500">
            top: stint · bottom: total · tap a kid to pull them off
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
                className={`rounded-[7px] bg-white p-3 shadow-[0_1px_3px_rgba(26,26,30,0.06)] ${st.availability === "inactive" ? "opacity-50" : ""}`}
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
                    <div className="mt-0.5 text-sm tabular-nums text-neutral-500">
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
                      Sub in now
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
                      onClick={() => setConfirmLeaveId(p.id)}
                      className="min-h-[44px] rounded-lg px-3 py-2 text-sm font-bold text-neutral-500"
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

      {/* Once-per-game action — deliberately smaller and out of the thumb zone */}
      <button
        type="button"
        onClick={() => setConfirmEnd(true)}
        className="min-h-[44px] w-full rounded-[7px] bg-red-50 px-4 py-3 text-sm font-bold text-red-700 ring-1 ring-red-200"
      >
        End game
      </button>

      {/* Thumb-zone control — the one button the coach reaches for most,
          pinned within reach while running around */}
      <div className="sticky bottom-0 bg-[#f3f5f8] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          onClick={onPauseToggle}
          className={`w-full rounded-[7px] px-4 py-4 text-lg font-extrabold transition active:scale-[0.98] ${
            clockRunning
              ? "bg-white text-[#1a1a1e] shadow-[0_2px_8px_rgba(26,26,30,0.18)] ring-1 ring-hairline"
              : "bg-[#2563eb] text-white shadow-[0_2px_10px_rgba(37,99,235,0.35)]"
          }`}
        >
          {clockRunning ? "Pause" : "Play"}
        </button>
      </div>

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

      {confirmEnd && (
        <ConfirmSheet
          title="End the game and show the report?"
          confirmLabel="End game"
          danger
          onConfirm={() => {
            setConfirmEnd(false);
            onEnd();
          }}
          onCancel={() => setConfirmEnd(false)}
        />
      )}

      {confirmLeaveId && (
        <ConfirmSheet
          title={`Take ${byId.get(confirmLeaveId)?.name ?? "this player"} out of the game (injury/leaving)?`}
          confirmLabel="Leave game"
          danger
          onConfirm={() => {
            onSetAvailability(confirmLeaveId, false);
            setConfirmLeaveId(null);
          }}
          onCancel={() => setConfirmLeaveId(null)}
        />
      )}
    </div>
  );
}
