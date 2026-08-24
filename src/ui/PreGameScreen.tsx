import { useState } from "react";
import type { GameConfig, Player } from "../types";
import { fmtClock } from "../lib/format";
import { Avatar } from "./bits";

interface Props {
  roster: Player[];
  config: GameConfig;
  onConfigChange: (config: GameConfig) => void;
  onStart: (presentIds: string[]) => void;
  onBackToSetup: () => void;
}

function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="text-sm font-bold text-[#1a1a1e]">{label}</div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          className="h-8 w-8 rounded-lg bg-neutral-100 text-lg font-bold text-[#1a1a1e]"
          aria-label={`decrease ${label}`}
        >
          −
        </button>
        <span className="w-16 text-center text-base font-extrabold tabular-nums">
          {value}
          {suffix ?? ""}
        </span>
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          className="h-8 w-8 rounded-lg bg-neutral-100 text-lg font-bold text-[#1a1a1e]"
          aria-label={`increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function PreGameScreen({ roster, config, onConfigChange, onStart, onBackToSetup }: Props) {
  // Most kids show up, so everyone starts present and the coach taps only the
  // no-shows. Late arrivals join mid-game via "Arrived" in the list view.
  const [absent, setAbsent] = useState<Set<string>>(() => new Set());
  // Settings persist all season, so collapsed is the normal case — a coach
  // shouldn't have to scroll a full stepper stack before every single game.
  const [expanded, setExpanded] = useState(false);

  const presentIds = roster.filter((p) => !absent.has(p.id)).map((p) => p.id);

  function toggle(id: string) {
    setAbsent((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Quarter length is the knob the coach actually thinks in, but the stored
  // schema is still gameLengthSec + quarterCount — derive display from it and
  // write both fields together on every change so they can never drift apart.
  const quarterLenMin = Math.max(
    1,
    Math.round(config.gameLengthSec / Math.max(1, config.quarterCount) / 60),
  );
  const totalMin = Math.round(config.gameLengthSec / 60);
  const quarterLenSec = config.gameLengthSec / Math.max(1, config.quarterCount);

  function setQuarterLenMin(v: number) {
    onConfigChange({ ...config, gameLengthSec: config.quarterCount * v * 60 });
  }
  function setQuarterCount(v: number) {
    // Keep the per-quarter length the coach just set constant; only the total changes.
    onConfigChange({ ...config, quarterCount: v, gameLengthSec: v * quarterLenMin * 60 });
  }

  const perKidSec =
    presentIds.length > 0
      ? (config.gameLengthSec * Math.min(config.playersOnField, presentIds.length)) / presentIds.length
      : 0;
  const subAlarmCount = Math.floor(config.gameLengthSec / Math.max(1, config.subIntervalSec));

  // Collapsed summary as labeled value pairs, not a run-on sentence — the
  // coach scans labels, they don't read paragraphs.
  const summaryItems: Array<[string, string]> = [
    ["format", `${config.playersOnField}v${config.playersOnField}`],
    ["quarters", `${config.quarterCount} × ${quarterLenMin}m`],
    ["sub every", `${Math.round(config.subIntervalSec / 60)}m`],
    ["max on", `${Math.round(config.maxStintSec / 60)}m`],
    ["min on", `${Math.round(config.shieldSec / 60)}m`],
  ];

  const warnings: string[] = [];
  if (config.shieldSec >= config.subIntervalSec) {
    warnings.push(
      `Min time on (${Math.round(config.shieldSec / 60)}m) ≥ sub interval (${Math.round(config.subIntervalSec / 60)}m) — kids will still be shielded when the sub alarm rings`,
    );
  }
  if (config.subIntervalSec > quarterLenSec) {
    warnings.push("Sub interval is longer than a quarter — some quarters will have no sub alarm");
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onBackToSetup} className="px-1 py-1 text-base font-bold text-neutral-400">
          ← Roster
        </button>
        <h1 className="text-xl font-extrabold">Game day</h1>
      </header>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Who's here ({presentIds.length}/{roster.length})
          </h2>
          <span className="text-xs text-neutral-400">tap no-shows</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {roster.map((p) => {
            const out = absent.has(p.id);
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => toggle(p.id)}
                className={`flex items-center gap-2 rounded-[7px] p-1.5 text-left transition active:scale-[0.97] ${
                  out ? "bg-neutral-100 opacity-55" : "bg-white shadow-[0_1px_3px_rgba(26,26,30,0.06)] ring-1 ring-hairline"
                }`}
              >
                <Avatar player={{ ...p, photoDataUrl: out ? undefined : p.photoDataUrl }} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm font-bold ${out ? "line-through text-neutral-400" : ""}`}>
                    {p.name.split(" ")[0]}
                  </div>
                  <div className={`text-[11px] font-bold uppercase ${out ? "text-red-500" : "text-green-600"}`}>
                    {out ? "out" : "here"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-neutral-400">
          No-shows can still join later — mark them Arrived during the game.
        </p>
      </section>

      <section className="rounded-[7px] bg-white p-4 shadow-[0_1px_3px_rgba(26,26,30,0.06)]">
        <div className="flex items-start justify-between gap-3">
          {/* Below the field size, there's no bench to rotate from — say
              that plainly instead of running the fair-share math into a
              degenerate "everyone plays 100%" line that reads like a bug. */}
          {presentIds.length === 0 ? (
            <div className="py-1 text-lg font-extrabold leading-snug">Nobody marked here yet.</div>
          ) : presentIds.length <= config.playersOnField ? (
            <div className="py-1 text-lg font-extrabold leading-snug">
              Only {presentIds.length} here — everyone plays the whole game, no subs
            </div>
          ) : (
            <div className="flex gap-6">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  each kid plays
                </div>
                <div className="text-3xl font-black leading-tight tabular-nums">
                  ~{fmtClock(perKidSec)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  sub alarms
                </div>
                <div className="text-3xl font-black leading-tight tabular-nums">
                  {subAlarmCount}×
                </div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="min-h-[44px] shrink-0 rounded-[7px] bg-neutral-100 px-3.5 py-2 text-sm font-bold text-[#1a1a1e] transition active:scale-[0.98]"
          >
            {expanded ? "Done" : "Edit"}
          </button>
        </div>

        {!expanded && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-3">
            {summaryItems.map(([label, value]) => (
              <div key={label}>
                <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                  {label}
                </div>
                <div className="text-sm font-extrabold tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {warnings.map((w) => (
              <p key={w} className="rounded-[7px] bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                {w}
              </p>
            ))}
          </div>
        )}

        {expanded && (
          <>
            <div className="mt-3 h-px bg-hairline" />
            <Stepper
              label="On field"
              value={config.playersOnField}
              min={1}
              max={Math.max(1, roster.length)}
              onChange={(v) => onConfigChange({ ...config, playersOnField: v })}
            />
            <div className="h-px bg-hairline" />
            <Stepper
              label="Quarter length"
              value={quarterLenMin}
              suffix="m"
              min={4}
              max={30}
              onChange={setQuarterLenMin}
            />
            <div className="h-px bg-hairline" />
            <Stepper
              label="Quarters"
              value={config.quarterCount}
              suffix=""
              min={1}
              max={8}
              onChange={setQuarterCount}
            />
            <p className="pb-1 pt-0.5 text-[11px] text-neutral-400">= {totalMin} min game</p>
            <div className="h-px bg-hairline" />
            <Stepper
              label="Sub every"
              value={Math.round(config.subIntervalSec / 60)}
              suffix="m"
              min={1}
              max={30}
              onChange={(v) => onConfigChange({ ...config, subIntervalSec: v * 60 })}
            />
            <p className="pb-1 pt-0.5 text-[11px] text-neutral-400">
              Alarm every {fmtClock(config.subIntervalSec)} · auto-pause each quarter for water
            </p>

            <div className="mt-2 h-px bg-hairline" />
            <h2 className="pt-2 text-xs font-bold uppercase tracking-wider text-neutral-400">Heat rules</h2>
            <Stepper
              label="Max time on (heat)"
              value={Math.round(config.maxStintSec / 60)}
              suffix="m"
              min={1}
              max={60}
              onChange={(v) => onConfigChange({ ...config, maxStintSec: v * 60 })}
            />
            <div className="h-px bg-hairline" />
            <Stepper
              label="Min time before sub-out"
              value={Math.round(config.shieldSec / 60)}
              suffix="m"
              min={0}
              max={30}
              onChange={(v) => onConfigChange({ ...config, shieldSec: v * 60 })}
            />
            <p className="pb-1 pt-0.5 text-[11px] text-neutral-400">
              Nobody stays on past the max; a kid can't be pulled before the min.
            </p>
          </>
        )}
      </section>

      <div className="sticky bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          onClick={() => onStart(presentIds)}
          disabled={presentIds.length === 0}
          className={`${btnStart} disabled:opacity-40`}
        >
          Start game
        </button>
      </div>
    </div>
  );
}

const btnStart =
  "w-full rounded-[7px] bg-[#1a1a1e] px-4 py-3.5 text-lg font-extrabold text-white shadow-[0_2px_8px_rgba(26,26,30,0.18)] active:scale-[0.98] transition";
