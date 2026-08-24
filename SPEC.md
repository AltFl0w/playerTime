# PlayerTime — Spec

Equal playing-time manager for youth soccer (4v4, 6–7 kids aged 4–5). Coach's phone runs
the game; alarms prompt swaps at dead balls; every actual sub is tapped in; the engine keeps
everyone converging on equal minutes and produces an end-of-game receipt for parents.

## Core philosophy

No fixed substitution script. The game is **event-sourced**: an append-only log of `GameEvent`s
(see `src/types.ts`). State is always recomputed from events. The engine continuously answers one
question: **"who is the fairest kid to come out right now?"** That single function drives normal
rotations, meltdown recoveries, late arrivals — everything.

## Fairness model

- **Share rate** at any moment: `playersOnField / activeCount` minutes of target per minute elapsed.
  Active = players marked available (not inactive/absent, not in `declined_wait`).
- **Target accrual** is integral over time because the active count changes mid-game:
  `targetSec(p) = ∫ rate(τ) dτ` over clock segments where p was available.
  A player who is unavailable (absent, injured, declined-wait) neither plays nor accrues.
- **Suggestion rule:** never schedule anyone beyond their own target or the heat cap. Equal minutes
  emerge; no make-up marathons are possible.

### Refusals (4-year-old meltdowns)

1. Alarm suggests "IN: Patrick". He refuses → coach taps **Decline** → event logs it, Patrick enters
   `declined_wait`: excluded from suggestions AND from the active denominator.
2. Effect is automatic: teammates accrue slightly faster while he's out; his final total ends below
   theirs by exactly the stint he skipped. No dock math needed, no punishment window, no marathon risk.
3. Parent later says "he's ready" → coach taps **Ready** (`MARK_READY`) → app ranks on-field kids by
   `played/target` descending (highest = most paid-up = fairest to pull). Fresh subs are shielded:
   ranked below everyone and shown dimmed ("fresh") until `shieldSec` on field — but still selectable.
   **Suggestions never block the coach**; the only hard rule is the field can't exceed `playersOnField`.
4. Coach confirms **Now** or **+N min** → pending swap shown with countdown on all screens.

### Heat cap

If any on-field player's current stint reaches `maxStintSec`, state sets `forcedSwap: true` —
alarm fires off-cycle, that player outranks everyone as the OUT suggestion, and the heat cap
overrides shields in the ranking. Still dismissible — the coach always outranks the engine.

## Engine API (pure functions, no DOM/React/storage)

Implemented in `src/engine/index.ts`, exporting `EngineApi` from `src/types.ts`:

- `computeState(events, config, roster)` → per-player `{playedSec, targetSec, ratio, onField,
  availability, currentStintSec, shifts, declines, longestStintSec}` + clock + forcedSwap.
  Clock advances only between START/RESUME and PAUSE/END.
- `suggestOut(state)` — eligible on-field player with highest ratio; null if none eligible.
- `suggestIn(state)` — available waiting player with lowest ratio; tie-break longest time since last
  off-field stint ended (then roster order).
- `rankOutCandidates` / `rankInCandidates` — full sorted lists so the UI can show the ranking.

Edge cases the engine must handle correctly:
- Roster size not divisible by playersOnField (uneven rests rotate fairly)
- Late arrival / early departure mid-game via `SET_AVAILABILITY`
- Declines followed by MARK_READY recovery
- Missed/delayed subs (suggestions derive from live state, so drift self-corrects)
- PAUSE (quarters/halftime) freezes clock and stints
- Empty states (no events yet, nobody on field) must not throw

## In-game loop (UI)

1. Pre-game: pick present kids, confirm config, START.
2. Every `subIntervalSec` of running clock: audible alarm (`<audio>`-element beep so iOS plays it on
   silent, vibration attempt guarded — a no-op on iOS, screen flash) showing planned `OUT ⇄ IN`
   names/photos big enough for a sideline glance. The clock auto-pauses at each quarter boundary
   (water break; stints freeze) until the coach starts the next quarter.
3. Clock keeps running through dead balls. Coach taps each name as reality happens:
   SUB_IN / SUB_OUT confirmed separately; DECLINE instead of IN if refused.
4. Live board: every kid's minutes vs target, who's next up, pending swaps with countdown.
5. END → report card: minutes per kid, % share, declines ("declined 2 shifts"), shifts, longest stint.
   This is the parent-group-chat receipt.

## Screens

Setup (roster CRUD, photo upload compressed client-side, notes like "blonde hair, glasses"),
Pre-game (availability toggles, fair-share preview, collapsed season settings with quarter-length
as the knob), Live (clock, field/list views, editable swap sheet, ready list, pending swaps),
Report (fairness verdict + one dense rotation-chart line per kid). Mobile-first, light, huge tap
targets, installable PWA (wake lock, standalone display; deployed via GitHub Pages — see README).
localStorage persistence; event log shape makes Supabase realtime sync a phase-2 drop-in.

## Out of scope v1

Accounts/auth, multi-team, goalie slot locking, cross-game fairness memory, backend sync.
