import type { GameConfig, GameState, Player, PlayerTimeState } from "../types";
import { fmtClock, fmtMinutes } from "../lib/format";
import { Avatar, SectionTitle, btnPrimary } from "./bits";

interface Props {
  roster: Player[];
  config: GameConfig;
  state: GameState;
  elapsedSec: number;
  startedAtMs: number | null;
  onNewGame: () => void;
}

export function ReportScreen({
  roster,
  config,
  state,
  elapsedSec,
  startedAtMs,
  onNewGame,
}: Props) {
  const rows = roster
    .map((p) => ({ p, st: state.players[p.id] }))
    .filter((r): r is { p: Player; st: PlayerTimeState } => !!r.st)
    .sort((a, b) => b.st.playedSec - a.st.playedSec);

  const totalPossible = Math.max(1, elapsedSec * config.playersOnField);
  const dateLine = startedAtMs
    ? new Date(startedAtMs).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <div className="flex flex-col gap-5">
      <header className="text-center">
        <div className="text-sm font-bold uppercase tracking-[0.3em] text-green-500">final</div>
        <h1 className="mt-1 text-3xl font-black">
          {config.playersOnField}v{config.playersOnField} · {fmtClock(elapsedSec)}
        </h1>
        {dateLine && <p className="mt-1 text-neutral-400">{dateLine}</p>}
      </header>

      <section className="flex flex-col gap-3 rounded-3xl bg-neutral-900 p-4 ring-1 ring-neutral-800">
        <SectionTitle>Playing time</SectionTitle>
        {rows.length === 0 && <p className="text-neutral-400">No players recorded.</p>}
        {rows.map(({ p, st }) => {
          const sharePct = Math.min(
            999,
            Math.round((st.playedSec / totalPossible) * 100),
          );
          return (
            <div
              key={p.id}
              className="flex items-center gap-4 rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800"
            >
              <Avatar player={p} className="h-16 w-16" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xl font-extrabold">{p.name}</div>
                <div className="text-sm tabular-nums text-neutral-400">
                  {st.shifts} shift{st.shifts === 1 ? "" : "s"} · longest {fmtClock(st.longestStintSec)}
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800"
                  role="img"
                  aria-label={`${sharePct}% of field time`}
                >
                  <div
                    className="h-full rounded-full bg-green-600"
                    style={{ width: `${Math.min(100, sharePct)}%` }}
                  />
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="text-3xl font-black tabular-nums text-green-400">
                  {fmtMinutes(st.playedSec)}
                </div>
                <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                  min · {sharePct}%
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {rows.some((r) => r.st.declines > 0) && (
        <section className="rounded-2xl bg-neutral-900 p-4 text-center ring-1 ring-neutral-800">
          {rows
            .filter((r) => r.st.declines > 0)
            .map(({ p, st }) => (
              <p key={p.id} className="py-0.5 text-base font-bold text-amber-300">
                {p.name} declined {st.declines} shift{st.declines === 1 ? "" : "s"}
              </p>
            ))}
        </section>
      )}

      <div className="pb-[env(safe-area-inset-bottom)]">
        <button type="button" onClick={onNewGame} className={btnPrimary}>
          New game
        </button>
        <p className="mt-3 text-center text-xs text-neutral-600">
          Screenshot this card for the parent group chat.
        </p>
      </div>
    </div>
  );
}
