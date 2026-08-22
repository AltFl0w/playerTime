import { useState } from "react";
import { engine } from "../engine";
import type { GameConfig, GameState, Player, PlayerTimeState } from "../types";
import type { PendingSwap } from "../store";
import { fmtClock } from "../lib/format";
import { Avatar, Badge, SectionTitle, btnGhost, btnPrimary, type BadgeTone } from "./bits";

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

function stintTone(st: PlayerTimeState, config: GameConfig): string {
  const frac = st.currentStintSec / Math.max(1, config.maxStintSec);
  if (frac >= 1) return "text-red-400";
  if (frac >= 0.75) return "text-amber-300";
  return "text-neutral-400";
}

function stintBarTone(st: PlayerTimeState, config: GameConfig): string {
  const frac = st.currentStintSec / Math.max(1, config.maxStintSec);
  if (frac >= 1) return "bg-red-500 animate-pulse";
  if (frac >= 0.75) return "bg-amber-400";
  return "bg-green-600";
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
  // Ready flow: which recovered kid we're picking an OUT for, then which OUT
  // we're scheduling for them.
  const [pickOutFor, setPickOutFor] = useState<string | null>(null);
  const [schedOutId, setSchedOutId] = useState<string | null>(null);

  const byId = new Map(roster.map((p) => [p.id, p]));
  const rows: Row[] = [];
  for (const p of roster) {
    const st = state.players[p.id];
    if (st) rows.push({ p, st });
  }
  rows.sort((a, b) => sortKey(a, null) - sortKey(b, null));

  const declinedKids = rows.filter((r) => r.st.availability === "declined_wait");
  const nextInId = engine.suggestIn(state, config);
  const sortedRows = [...rows].sort((a, b) => sortKey(a, nextInId) - sortKey(b, nextInId));

  const candidates =
    pickOutFor !== null
      ? engine.rankOutCandidates(state, config).filter((c) => state.players[c.playerId]?.onField)
      : [];
  const pickPlayer = pickOutFor ? byId.get(pickOutFor) ?? null : null;
  const schedPlayer = schedOutId ? byId.get(schedOutId) ?? null : null;

  function ineligibilityReason(st: PlayerTimeState): string {
    if (st.currentStintSec < config.shieldSec)
      return `fresh · ${fmtClock(config.shieldSec - st.currentStintSec)} left`;
    return "not eligible right now";
  }

  function startReadyFlow(id: string) {
    onMarkReady(id);
    setPickOutFor(id);
    setSchedOutId(null);
  }

  function closeFlows() {
    setPickOutFor(null);
    setSchedOutId(null);
  }

  const subCountdown = fmtClock(
    (Math.floor(elapsedSec / config.subIntervalSec) + 1) * config.subIntervalSec - elapsedSec,
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Clock header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">clock</div>
          <div className="text-6xl font-black leading-none tabular-nums">{fmtClock(elapsedSec)}</div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onPauseToggle}
            className={`rounded-xl px-6 py-3 text-lg font-bold ${
              clockRunning ? "bg-neutral-800 text-neutral-200" : "bg-green-600 text-white"
            }`}
          >
            {clockRunning ? "⏸ Pause" : "▶ Resume"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("End the game and show the report?")) onEnd();
            }}
            className="rounded-xl bg-red-950/70 px-6 py-2 text-base font-bold text-red-300 ring-1 ring-red-800"
          >
            END
          </button>
        </div>
      </div>

      {!clockRunning ? (
        <div className="rounded-xl bg-amber-500/15 py-2 text-center font-bold text-amber-300 ring-1 ring-amber-600/50">
          PAUSED — clock stopped
        </div>
      ) : (
        <div className="rounded-xl bg-neutral-900 py-2 text-center text-sm text-neutral-400">
          next sub alarm in{" "}
          <span className="font-bold tabular-nums text-green-400">{subCountdown}</span>
        </div>
      )}

      {/* Pending swaps with countdown */}
      {pendingSwaps.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Scheduled swaps</SectionTitle>
          {pendingSwaps.map((ps) => {
            const remain = ps.dueElapsedSec - elapsedSec;
            const out = byId.get(ps.outPlayerId);
            const inn = byId.get(ps.inPlayerId);
            return (
              <div
                key={ps.id}
                className={`flex items-center gap-3 rounded-2xl p-3 ring-1 ${
                  remain <= 0
                    ? "animate-pulse bg-red-950/60 ring-red-700"
                    : "bg-neutral-900 ring-neutral-800"
                }`}
              >
                <div className="min-w-0 flex-1 truncate text-lg font-bold">
                  {out?.name ?? "?"} ⇄ {inn?.name ?? "?"}
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-extrabold tabular-nums ${
                    remain <= 0 ? "bg-red-600 text-white" : "bg-neutral-800 text-green-400"
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

      {/* Ready flow — rank OUT candidates for a kid who just came back */}
      {pickOutFor !== null && schedOutId === null && (
        <section className="flex flex-col gap-2 rounded-3xl bg-neutral-900 p-4 ring-1 ring-green-800">
          <SectionTitle>
            {pickPlayer ? `${pickPlayer.name} is ready — who comes out?` : "Who comes out?"}
          </SectionTitle>
          {candidates.length === 0 && (
            <p className="py-2 text-neutral-400">Nobody is on the field yet.</p>
          )}
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
                className="flex items-center gap-3 rounded-2xl bg-neutral-800 p-3 text-left"
              >
                <Avatar player={p} className="h-12 w-12" />
                <div className="min-w-0 flex-1 truncate text-lg font-bold">{p.name}</div>
                <Badge tone="amber">{ratioPct} of target</Badge>
              </button>
            ) : (
              <div
                key={c.playerId}
                className="flex items-center gap-3 rounded-2xl bg-neutral-900 p-3 opacity-50 ring-1 ring-neutral-800"
              >
                <Avatar player={p} className="h-12 w-12 grayscale" />
                <div className="min-w-0 flex-1 truncate text-lg font-bold text-neutral-400">
                  {p.name}
                </div>
                <span className="text-sm text-neutral-500">{ineligibilityReason(st)}</span>
              </div>
            );
          })}
          <button type="button" onClick={closeFlows} className={btnGhost}>
            Cancel
          </button>
        </section>
      )}

      {pickOutFor !== null && schedOutId !== null && schedPlayer && pickPlayer && (
        <section className="flex flex-col gap-3 rounded-3xl bg-neutral-900 p-4 ring-1 ring-green-800">
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
          <button
            type="button"
            onClick={() => setSchedOutId(null)}
            className={btnGhost}
          >
            Back
          </button>
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
              className="flex items-center gap-3 rounded-2xl bg-neutral-900 p-3 text-left ring-1 ring-red-900 disabled:opacity-40"
            >
              <Avatar player={p} className="h-12 w-12" />
              <div className="min-w-0 flex-1 truncate text-lg font-bold">{p.name}</div>
              <span className="rounded-full bg-green-600 px-5 py-2 text-sm font-extrabold uppercase text-white">
                Ready
              </span>
            </button>
          ))}
        </section>
      )}

      {/* Live board */}
      <section className="flex flex-col gap-2">
        <SectionTitle>Squad</SectionTitle>
        {sortedRows.map(({ p, st }) => {
          const status = statusOf({ p, st }, nextInId);
          const showStint = st.onField && st.availability === "available";
          return (
            <div
              key={p.id}
              className={`rounded-2xl bg-neutral-900 p-3 ${st.availability === "inactive" ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-3">
                <Avatar player={p} className="h-14 w-14" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-bold">
                    {p.name}
                    {p.number !== undefined && (
                      <span className="ml-1.5 text-sm font-normal text-neutral-500">
                        #{p.number}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-sm tabular-nums text-neutral-400">
                    {fmtClock(st.playedSec)} / {fmtClock(st.targetSec)} min
                    {showStint && (
                      <>
                        {" · "}
                        <span className={`font-bold ${stintTone(st, config)}`}>
                          stint {fmtClock(st.currentStintSec)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
              {showStint && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className={`h-full rounded-full ${stintBarTone(st, config)}`}
                    style={{
                      width: `${Math.min(100, (st.currentStintSec / Math.max(1, config.maxStintSec)) * 100)}%`,
                    }}
                  />
                </div>
              )}
              <div className="mt-2 flex justify-end gap-2">
                {st.availability === "available" && !st.onField && (
                  <button
                    type="button"
                    onClick={() => onSubIn(p.id)}
                    className="rounded-lg bg-green-950 px-3 py-2 text-sm font-bold text-green-400 ring-1 ring-green-800"
                  >
                    ▶ Sub in now
                  </button>
                )}
                {st.onField && (
                  <button
                    type="button"
                    onClick={() => onSubOut(p.id)}
                    className="rounded-lg bg-neutral-800 px-3 py-2 text-sm font-bold text-neutral-300"
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
                    className="rounded-lg bg-neutral-800 px-3 py-2 text-sm font-bold text-green-400"
                  >
                    Arrived — add to game
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
