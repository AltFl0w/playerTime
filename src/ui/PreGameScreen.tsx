import { useState } from "react";
import type { GameConfig, Player } from "../types";
import { fmtClock } from "../lib/format";
import { Avatar, btnPrimary } from "./bits";

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
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-800 p-3">
      <div className="text-base font-bold text-neutral-300">{label}</div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          className="h-12 w-12 rounded-xl bg-neutral-700 text-2xl font-bold"
          aria-label={`decrease ${label}`}
        >
          −
        </button>
        <span className="w-20 text-center text-xl font-extrabold tabular-nums">
          {value}
          {suffix ?? ""}
        </span>
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          className="h-12 w-12 rounded-xl bg-neutral-700 text-2xl font-bold"
          aria-label={`increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function PreGameScreen({ roster, config, onConfigChange, onStart, onBackToSetup }: Props) {
  // Absent-set instead of present-set so players added later default to present.
  const [absent, setAbsent] = useState<Set<string>>(() => new Set());

  const presentIds = roster.filter((p) => !absent.has(p.id)).map((p) => p.id);
  const shortOf = config.playersOnField - presentIds.length;
  const canStart = roster.length > 0 && shortOf <= 0;

  function toggle(id: string) {
    setAbsent((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onBackToSetup} className="px-2 py-1 text-lg font-bold text-neutral-400">
          ← Roster
        </button>
        <h1 className="text-2xl font-extrabold">Game day</h1>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500">
          Who's here? ({presentIds.length}/{roster.length})
        </h2>
        {roster.map((p) => {
          const present = !absent.has(p.id);
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => toggle(p.id)}
              className={`flex items-center gap-3 rounded-2xl p-3 text-left ring-1 transition ${
                present
                  ? "bg-green-950/60 ring-green-700"
                  : "bg-neutral-900 opacity-60 ring-neutral-800"
              }`}
            >
              <Avatar player={p} className="h-14 w-14" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold">{p.name}</div>
                {p.note && <div className="truncate text-sm text-neutral-400">{p.note}</div>}
              </div>
              <span
                className={`rounded-full px-4 py-2 text-sm font-bold uppercase ${
                  present ? "bg-green-600 text-white" : "bg-neutral-700 text-neutral-300"
                }`}
              >
                {present ? "Present" : "Absent"}
              </span>
            </button>
          );
        })}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500">Format</h2>
        <Stepper
          label="Players on field"
          value={config.playersOnField}
          min={1}
          max={Math.max(1, roster.length)}
          onChange={(v) => onConfigChange({ ...config, playersOnField: v })}
        />
        <Stepper
          label="Game length"
          value={Math.round(config.gameLengthSec / 60)}
          suffix=" min"
          min={5}
          max={120}
          onChange={(v) => onConfigChange({ ...config, gameLengthSec: v * 60 })}
        />
        <Stepper
          label="Sub interval"
          value={Math.round(config.subIntervalSec / 60)}
          suffix=" min"
          min={1}
          max={30}
          onChange={(v) => onConfigChange({ ...config, subIntervalSec: v * 60 })}
        />
        <Stepper
          label="Max stint (heat cap)"
          value={Math.round(config.maxStintSec / 60)}
          suffix=" min"
          min={1}
          max={60}
          onChange={(v) => onConfigChange({ ...config, maxStintSec: v * 60 })}
        />
        <Stepper
          label="Fresh shield"
          value={Math.round(config.shieldSec / 60)}
          suffix=" min"
          min={0}
          max={30}
          onChange={(v) => onConfigChange({ ...config, shieldSec: v * 60 })}
        />
        <p className="px-1 text-sm text-neutral-500">
          Sub alarm every {fmtClock(config.subIntervalSec)} · nobody stays on past{" "}
          {fmtClock(config.maxStintSec)}
        </p>
      </section>

      <div className="sticky bottom-0 pb-[env(safe-area-inset-bottom)] pt-3">
        {canStart ? (
          <button type="button" onClick={() => onStart(presentIds)} className={`${btnPrimary} py-6 text-2xl`}>
            ▶ START GAME
          </button>
        ) : (
          <>
            <button type="button" disabled className={`${btnPrimary} py-6 text-2xl`}>
              ▶ START GAME
            </button>
            <p className="mt-2 text-center text-sm font-bold text-amber-400">
              Need {shortOf} more player{shortOf === 1 ? "" : "s"} present for{" "}
              {config.playersOnField}v{config.playersOnField}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
