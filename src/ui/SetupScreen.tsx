import { useState } from "react";
import type { Player } from "../types";
import { uid } from "../store";
import { fileToAvatarDataUrl } from "../lib/photo";
import { Avatar, SectionTitle, btnGhost, btnPrimary } from "./bits";

interface Props {
  roster: Player[];
  onSave: (player: Player) => void;
  onDelete: (id: string) => void;
  onNext: () => void;
  onLoadDemo?: () => void;
  onEraseAll?: () => void;
}

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
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Roster</h1>
        <button
          type="button"
          onClick={onNext}
          disabled={roster.length === 0}
          className={`${btnPrimary} w-auto px-6`}
        >
          Lineup →
        </button>
      </header>

      <section className="flex flex-col gap-3 rounded-3xl bg-neutral-900 p-4">
        <SectionTitle>{editingId ? "Edit player" : "Add player"}</SectionTitle>
        <div className="flex items-center gap-4">
          {photo ? (
            <img src={photo} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-neutral-800 text-xs text-neutral-500">
              no photo
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label className="cursor-pointer rounded-xl bg-neutral-800 px-4 py-3 text-base font-bold text-neutral-200">
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
                className="rounded-xl px-2 py-1 text-left text-sm font-bold text-red-400"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="w-full rounded-xl bg-neutral-800 px-4 py-3 text-lg outline-none ring-green-600 focus:ring-2"
        />
        <div className="flex gap-3">
          <input
            value={numberStr}
            onChange={(e) => setNumberStr(e.target.value)}
            inputMode="numeric"
            placeholder="# (optional)"
            className="w-32 rounded-xl bg-neutral-800 px-4 py-3 text-lg outline-none ring-green-600 focus:ring-2"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder='Note e.g. "blonde hair, glasses"'
            className="min-w-0 flex-1 rounded-xl bg-neutral-800 px-4 py-3 text-lg outline-none ring-green-600 focus:ring-2"
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={save} disabled={!name.trim()} className={btnPrimary}>
            {editingId ? "Save changes" : "Add player"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className={btnGhost}>
              Cancel
            </button>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>{roster.length} players</SectionTitle>
        {roster.length === 0 && (
          <p className="rounded-xl bg-neutral-900 p-4 text-neutral-400">
            Add your squad above — name is enough, the rest is optional.
          </p>
        )}
        {roster.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-neutral-900 p-3">
            <Avatar player={p} className="h-14 w-14" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-bold">
                {p.name}
                {p.number !== undefined && (
                  <span className="ml-2 font-normal text-neutral-400">#{p.number}</span>
                )}
              </div>
              {p.note && <div className="truncate text-sm text-neutral-400">{p.note}</div>}
            </div>
            <button
              type="button"
              onClick={() => startEdit(p)}
              className="rounded-xl bg-neutral-800 px-4 py-3 font-bold text-neutral-200"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => remove(p.id)}
              aria-label={`Delete ${p.name}`}
              className="rounded-xl bg-neutral-800 px-4 py-3 font-bold text-red-400"
            >
              ✕
            </button>
          </div>
        ))}
      </section>

      {import.meta.env.DEV && onLoadDemo && onEraseAll && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-neutral-800 p-3">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-600">
            dev tools
          </span>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Replace current data with the demo team?")) onLoadDemo();
            }}
            className="rounded-xl bg-neutral-800 px-4 py-2 text-sm font-bold text-neutral-300"
          >
            Load demo data
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Erase ALL saved data? This can't be undone.")) onEraseAll();
            }}
            className="rounded-xl bg-neutral-800 px-4 py-2 text-sm font-bold text-red-400"
          >
            Erase all
          </button>
        </section>
      )}
    </div>
  );
}
