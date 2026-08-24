# PlayerTime

Equal playing-time tracker for youth soccer coaches. Runs on the coach's phone at the sideline: sub alarms at intervals, one-tap swap confirmations, and an end-of-game report showing every kid's minutes against their fair share.

**Live app:** https://altfl0w.github.io/playerTime/

## Install on a phone

Open the URL in Safari (iOS) or Chrome (Android) → Share / menu → **Add to Home Screen**. It launches full-screen, keeps the screen awake during a game, and the alarm plays even with the iPhone ringer switch on silent. All data lives on-device (localStorage) — no account, works with no signal.

## Development

```
npm install
npm run dev        # local dev server (Load demo data available on Roster screen, dev-only)
npx vitest run     # engine tests
npx vite build     # production build
```

## Deploy

Push to `main` → GitHub Actions builds and publishes to GitHub Pages (~30s). Config: `.github/workflows/deploy.yml`; Vite uses `base: "./"` so the build works under the `/playerTime/` subpath.

## How it works

The game is event-sourced: an append-only `GameEvent` log, with all state recomputed from it by a pure engine (`src/engine/`, fully unit-tested). The engine continuously answers "who is the fairest kid to come out right now?" — that one ranking drives rotations, meltdown recoveries, and late arrivals. Design details in [SPEC.md](SPEC.md); agent/contributor notes in [CLAUDE.md](CLAUDE.md).
