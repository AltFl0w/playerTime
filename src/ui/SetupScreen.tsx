import { useState } from "react";
import type { Player } from "../types";
import { uid } from "../store";
import { fileToAvatarDataUrl } from "../lib/photo";
import { Avatar } from "./bits";

interface Props {
  roster: Player[];
  onSave: (player: Player) => void;
  onDelete: (id: string) => void;
  onNext: () => void;
  onLoadDemo?: () => void;
  onEraseAll?: () => void;
}

const inputCls =
  "rounded-[11px] border border-hairline bg-canvas px-3.5 py-3 text-[15px] text-ink outline-none placeholder:text-faintink focus:border-ink";

export function SetupScreen({ roster, onSave, onDelete, onNext, onLoadDemo, onEraseAll }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [numberStr, setNumberStr] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | undefined>(undefined);

  function resetForm() {
    setEditingId(null);
    setName("");
    setNumberStr("");
    setNote("");
    setPhoto(undefined);
  }

  function startEdit(p: Player) {
    setEditingId(p.id);
    setName(p.name);
    setNumberStr(p.number === undefined ? "" : String(p.number));
    setNote(p.note ?? "");
    setPhoto(p.photoDataUrl);
    window.scrollTo({ top: 0 });
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto(await fileToAvatarDataUrl(file));
    } catch {
      window.alert("Couldn't read that image — try another photo.");
    }
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const parsedNum = Number.parseInt(numberStr, 10);
    onSave({
      id: editingId ?? uid(),
      name: trimmed,
      number: Number.isFinite(parsedNum) ? parsedNum : undefined,
      note: note.trim() || undefined,
      photoDataUrl: photo,
    });
    resetForm();
  }

  function remove(id: string) {
    const p = roster.find((x) => x.id === id);
    if (p && window.confirm(`Remove ${p.name} from the roster?`)) {
      if (editingId === id) resetForm();
      onDelete(id);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[21px] font-semibold tracking-[-0.02em]">Roster</h1>

      {/* Add / edit form */}
      <section className="flex flex-col gap-3 rounded-xl border border-hairline2 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faintink">
          {editingId ? "Edit player" : "Add player"}
        </div>
        <div className="flex items-center gap-3">
          {photo ? (
            <img src={photo} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-[10px] text-faintink">
              no photo
            </div>
          )}
          <label className="min-h-[44px] cursor-pointer rounded-[11px] border border-hairline2 bg-card px-4 py-2.5 text-[14px] font-medium text-mutedink active:scale-[0.98]">
            {photo ? "Change photo" : "Add photo"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void pickPhoto(e.target.files?.[0])}
            />
          </label>
          {photo && (
            <button
              type="button"
              onClick={() => setPhoto(undefined)}
              className="min-h-[44px] px-2 text-[13px] font-semibold text-stagedout"
            >
              Remove
            </button>
          )}
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className={`${inputCls} w-full`}
        />
        <div className="flex gap-2">
          <input
            value={numberStr}
            onChange={(e) => setNumberStr(e.target.value)}
            inputMode="numeric"
            placeholder="#"
            className={`${inputCls} w-20 shrink-0`}
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder='Note e.g. "blonde hair, glasses"'
            className={`${inputCls} min-w-0 flex-1`}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!name.trim()}
            className="min-h-[48px] flex-1 rounded-[11px] bg-ink text-[15px] font-semibold text-white active:scale-[0.99] disabled:border disabled:border-hairline disabled:bg-canvas disabled:text-faintink"
          >
            {editingId ? "Save changes" : "Add player"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="min-h-[48px] rounded-[11px] border border-hairline2 bg-card px-4 text-[14px] font-medium text-mutedink active:scale-[0.98]"
            >
              Cancel
            </button>
          )}
        </div>
      </section>

      {/* Player list — thin rows, same shape as pre-game */}
      <section>
        <div className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faintink">
          {roster.length} players
        </div>
        {roster.length === 0 ? (
          <p className="rounded-xl border border-hairline bg-card p-4 text-[14px] text-mutedink">
            Add your squad above — name is enough, the rest is optional.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-hairline2 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {roster.map((p, i) => (
              <div
                key={p.id}
                className={`flex min-h-[54px] items-center gap-2.5 py-1.5 pl-3 pr-1.5 ${i > 0 ? "border-t border-hairline" : ""}`}
              >
                <Avatar player={p} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">
                    {p.name}
                    {p.number !== undefined && (
                      <span className="ml-1.5 font-normal text-faintink">#{p.number}</span>
                    )}
                  </div>
                  {p.note && <div className="truncate text-[12px] text-faintink">{p.note}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(p)}
                  className="min-h-[44px] rounded-[10px] px-3 text-[13px] font-semibold text-mutedink active:bg-canvas"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  aria-label={`Delete ${p.name}`}
                  className="min-h-[44px] rounded-[10px] px-3 text-[13px] font-semibold text-stagedout active:bg-canvas"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {import.meta.env.DEV && onLoadDemo && onEraseAll && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-hairline2 p-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faintink">
            dev tools
          </span>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Replace current data with the demo team?")) onLoadDemo();
            }}
            className="rounded-[10px] border border-hairline2 bg-card px-3.5 py-2 text-[13px] font-semibold text-mutedink"
          >
            Load demo data
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Erase ALL saved data? This can't be undone.")) onEraseAll();
            }}
            className="rounded-[10px] border border-stagedout-line bg-card px-3.5 py-2 text-[13px] font-semibold text-stagedout"
          >
            Erase all
          </button>
        </section>
      )}

      {/* The screen's one commit, same dock pattern as everywhere else */}
      <div className="sticky bottom-0 -mx-4 border-t border-hairline bg-canvas px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={onNext}
          disabled={roster.length === 0}
          className="min-h-[52px] w-full rounded-[11px] bg-ink text-[15px] font-semibold text-white active:scale-[0.99] disabled:border disabled:border-hairline disabled:bg-canvas disabled:text-faintink"
        >
          Game day →
        </button>
      </div>
    </div>
  );
}
