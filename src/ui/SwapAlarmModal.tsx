import type { Player } from "../types";
import { Avatar, btnDanger, btnGhost, btnPrimary } from "./bits";

interface Props {
  title: string;
  subtitle?: string;
  outPlayer: Player | null;
  inPlayer: Player | null;
  outDone: boolean;
  inDone: boolean; // confirmed in OR refused
  onConfirmOut: () => void;
  onConfirmIn: () => void;
  onRefuseIn: () => void;
  onDismiss: () => void;
}

function Side({ player, role }: { player: Player | null; role: "OUT" | "IN" }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">{role}</div>
      {player ? (
        <>
          <Avatar player={player} className="h-24 w-24 ring-4 ring-neutral-700" />
          <div className="max-w-[9rem] truncate text-center text-xl font-extrabold">
            {player.name}
          </div>
        </>
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-neutral-800 text-3xl text-neutral-600">
          —
        </div>
      )}
    </div>
  );
}

export function SwapAlarmModal({
  title,
  subtitle,
  outPlayer,
  inPlayer,
  outDone,
  inDone,
  onConfirmOut,
  onConfirmIn,
  onRefuseIn,
  onDismiss,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-md rounded-3xl border border-red-800/60 bg-neutral-900 p-5 shadow-2xl">
        <div className="text-center">
          <div className="text-3xl font-black tracking-wide text-red-400">{title}</div>
          {subtitle && <div className="mt-1 text-sm text-neutral-400">{subtitle}</div>}
        </div>
        <div className="my-5 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          <Side player={outPlayer} role="OUT" />
          <div className="pt-10 text-3xl text-neutral-500">⇄</div>
          <Side player={inPlayer} role="IN" />
        </div>
        <div className="flex flex-col gap-3">
          {outPlayer && (
            <button type="button" disabled={outDone} onClick={onConfirmOut} className={btnPrimary}>
              {outDone ? "✓ " : ""}
              {outPlayer.name} went off
            </button>
          )}
          {inPlayer ? (
            <>
              <button type="button" disabled={inDone} onClick={onConfirmIn} className={btnPrimary}>
                {inDone ? "✓ " : ""}
                {inPlayer.name} went in
              </button>
              <button type="button" disabled={inDone} onClick={onRefuseIn} className={btnDanger}>
                {inPlayer.name} refused
              </button>
            </>
          ) : (
            <div className="rounded-xl bg-neutral-800 p-3 text-center font-bold text-neutral-400">
              no one waiting — sub out only
            </div>
          )}
          <button type="button" onClick={onDismiss} className={btnGhost}>
            Not yet — dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
