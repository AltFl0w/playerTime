import type { Player } from "../types";
import { Avatar } from "./bits";

interface Props {
  outPlayer: Player | null;
  inPlayer: Player | null;
  onSwapNow: () => void;
  onSchedule: (delayMin: number) => void;
  onCancel: () => void;
}

// Tap-a-kid confirmation sheet from Field view. The pair is pre-decided by
// the engine; the coach only picks timing.
export function SwapSheet(props: Props) {
  const { outPlayer, inPlayer } = props;
  const ready = !!outPlayer && !!inPlayer;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1a1a1e]/40 p-4 pb-6">
      <div className="w-full max-w-md rounded-[7px] bg-white p-4 shadow-2xl">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Side player={outPlayer} label="OFF" ring="ring-red-500" />
          <div className="text-2xl text-neutral-300">⇄</div>
          <Side player={inPlayer} label="IN" ring="ring-green-600" />
        </div>
        <button
          type="button"
          onClick={props.onSwapNow}
          disabled={!ready}
          className="mt-3 w-full rounded-[7px] bg-[#2563eb] px-4 py-3 text-lg font-extrabold text-white shadow-[0_2px_10px_rgba(37,99,235,0.35)] transition active:scale-[0.98] disabled:opacity-40"
        >
          Swap now
        </button>
        <div className="mt-2 flex gap-2">
          {[1, 2, 3].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => props.onSchedule(m)}
              disabled={!ready}
              className="flex-1 rounded-[7px] bg-neutral-100 px-2 py-2.5 text-sm font-bold text-[#1a1a1e] transition active:scale-[0.98] disabled:opacity-40"
            >
              +{m} min
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={props.onCancel}
          className="min-h-[44px] w-full py-2 pt-2 text-sm font-bold text-neutral-400"
        >
          Cancel
        </button>
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
