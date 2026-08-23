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

  const presentIds = roster.filter((p) => !absent.has(p.id)).map((p) => p.id);

  function toggle(id: string) {
    setAbsent((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
                className={`flex items-center gap-2 rounded-2xl p-1.5 text-left transition active:scale-[0.97] ${
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
      </section>

      <section className="rounded-2xl bg-white px-4 py-2 shadow-[0_1px_3px_rgba(26,26,30,0.06)]">
        <Stepper
          label="On field"
          value={config.playersOnField}
          min={1}
          max={Math.max(1, roster.length)}
          onChange={(v) => onConfigChange({ ...config, playersOnField: v })}
        />
        <div className="h-px bg-hairline" />
        <Stepper
          label="Game length"
          value={Math.round(config.gameLengthSec / 60)}
          suffix="m"
          min={5}
          max={120}
          onChange={(v) => onConfigChange({ ...config, gameLengthSec: v * 60 })}
        />
        <div className="h-px bg-hairline" />
        <Stepper
          label="Quarters"
          value={config.quarterCount}
          suffix=""
          min={1}
          max={8}
          onChange={(v) => onConfigChange({ ...config, quarterCount: v })}
        />
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
      </section>

      <section className="rounded-2xl bg-white px-4 py-2 shadow-[0_1px_3px_rgba(26,26,30,0.06)]">
        <h2 className="pt-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
          Heat rules
        </h2>
        <div className="mt-1" />
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
          label="Min time on before sub-out"
          value={Math.round(config.shieldSec / 60)}
          suffix="m"
          min={0}
          max={30}
          onChange={(v) => onConfigChange({ ...config, shieldSec: v * 60 })}
        />
        <p className="pb-1 pt-0.5 text-[11px] text-neutral-400">
          Nobody stays on past the max; a kid can't be pulled before the min.
        </p>
      </section>

      <div className="sticky bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <button type="button" onClick={() => onStart(presentIds)} className={`${btnStart}`}>
          Start game
        </button>
      </div>
    </div>
  );
}

const btnStart =
  "w-full rounded-2xl bg-[#1a1a1e] px-4 py-3.5 text-lg font-extrabold text-white shadow-[0_2px_8px_rgba(26,26,30,0.18)] active:scale-[0.98] transition";
