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

## Recorded instruments

Six optional instrument collections (orchestral strings, brass, woodwinds, keys and
mallets, percussion, and a broad mix) come from
[VS Chamber Orchestra: Community Edition](https://github.com/sgossner/VSCO-2-CE)
(CC0, recorded by Sam Gossner, Simon Dalzell and others; Versilian Studios). They are
processed by `scripts/samples/build.mjs` into `apps/procmuse/public/samples/` and
downloaded by the app only when a listener picks a collection.
