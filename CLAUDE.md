# PlayerTime — agent notes

Equal-playtime tracker Brandon uses coaching his kids' soccer team. React + TS + Vite + Tailwind, no backend — localStorage only. Live at https://altfl0w.github.io/playerTime/ (GitHub Pages, auto-deploys on push to `main`).

## Commands

- `npm run dev` — dev server
- `npx tsc --noEmit && npx vitest run && npx vite build` — the verification gate; run all three before every commit (30 engine tests must stay green)

## Architecture

- `src/engine/` — pure event-sourced engine, no DOM/React. State is always a replay of the `GameEvent` log. Event `atSec` values are game-clock seconds (pauses cost nothing). Don't put UI concerns here; don't compute state anywhere else.
- `src/App.tsx` — orchestration: authoritative clock (event elapsed + wall offset via `runningSinceMs`), alarm priority (pending > forced heat-cap > interval), quarter auto-pause (boundary-crossing detection, PAUSE backdated to the boundary — exact-second checks miss when the phone sleeps).
- `src/ui/` — screens. `src/lib/` — wake lock, alarm audio, photo compression.

## iOS PWA constraints (hard-won, don't regress)

- Alarm audio must go through an `<audio>` element (`src/lib/alarm.ts`) — iOS mutes WebAudio when the ringer switch is on silent. `navigator.vibrate` does not exist on iOS; the guarded call is a deliberate no-op.
- Wake lock (`src/lib/wakeLock.ts`) must be held on the live screen and re-acquired on `visibilitychange`.
- Keep `base: "./"` in vite.config and relative URLs in `public/manifest.json` — the app serves from a subpath.

## UX rules (each learned from a user correction — apply without re-asking)

1. **Nothing blocks the coach.** Engine output is suggestion only: ordering, dimming, "PICK" tags. Never disable an action because of shield/heat rules. The one hard rule Brandon asked for: players on field can't exceed `playersOnField` via a no-out send-in.
2. **One screen, no scrolling** for anything used mid-game or glanced at (the report is one dense line per kid).
3. **No run-on text**: labeled stat blocks and label-over-value pairs, never dot-separated sentences.
4. **Selections stay editable** — never lock a suggested pair; candidates shown as side-by-side off/in columns.
5. **Derived settings stay in sync by construction** (quarter length is the knob; game length is computed). Season-stable settings live collapsed behind Edit.
6. Tap targets ≥44px on the live screen; thumb-zone placement for the most-used control.
