# ProcMuse

A procedural music engine you can drop into any app, and a funky app built on it.

- **`@procmuse/engine`** — headless TypeScript library: composer, synthesizer, mixer.
  Runs in an AudioWorklet, a worker, or Node. Seeded and deterministic.
- **The app** — a 4k-inspired animated background with a translucent, movable,
  accessible control surface on top.

Work in progress; see `docs/BOARD.md` for the current state.

```bash
npm install
npm test            # engine tests, architecture pins, toolbox self-tests
npm run render -- --style techno --seconds 60 --out renders/techno.wav
```
