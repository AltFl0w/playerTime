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
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1a1a1e]/40 p-4 pb-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Side player={outPlayer} label="OFF" ring="ring-red-500" />
          <div className="text-3xl text-neutral-300">⇄</div>
          <Side player={inPlayer} label="IN" ring="ring-green-600" />
        </div>
        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            onClick={props.onSwapNow}
            disabled={!outPlayer || !inPlayer}
            className="w-full rounded-2xl bg-[#ea580c] px-4 py-6 text-xl font-extrabold text-white shadow-[0_2px_10px_rgba(234,88,12,0.35)] active:scale-[0.98] transition disabled:opacity-40"
          >
            Swap now
          </button>
          {[1, 2, 3].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => props.onSchedule(m)}
              disabled={!outPlayer || !inPlayer}
              className="w-full rounded-2xl bg-neutral-100 px-4 py-3 text-lg font-bold text-[#1a1a1e] transition active:scale-[0.98] disabled:opacity-40"
            >
              In +{m} min
            </button>
          ))}
          <button
            type="button"
            onClick={props.onCancel}
            className="w-full rounded-2xl px-4 py-2 font-bold text-neutral-400"
          >
            Cancel
          </button>
        </div>
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
    <div className="flex flex-col items-center gap-2">
      {player ? (
        <>
          <Avatar player={player} className={`h-28 w-28 ring-4 ${ring}`} />
          <div className="max-w-[9rem] truncate text-center text-2xl font-extrabold">
            {player.name}
          </div>
          <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">
            {label}
          </div>
        </>
      ) : (
        <>
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-neutral-100 text-3xl text-neutral-300">
            ?
          </div>
          <div className="text-sm text-neutral-400">no suggestion</div>
        </>
      )}
    </div>
  );
}
