# Testing — what proves this

## Commands

| Command | What it runs |
| --- | --- |
| `npm test` | Vitest (engine, web, ui, visuals, pins) then `node --test` over the copied Toolbox tools |
| `GATE_TESTS=0 bash scripts/gate.sh` | cheap tier: `npm run typecheck` (exit 2 = cheap only) |
| `bash scripts/gate.sh` | full tier: typecheck + `npm test` (exit 0 = verified) |
| `npm run e2e` | builds the app, serves `dist/`, drives headless Chromium: start, audio running, events flowing, canvas drawing, keyboard help, no errors |
| `npm run render -- --style techno --seconds 60 --out renders/x.wav` | offline render with loudness stats per second |
| `npm run dup:candidates` / `npm run repeated:code` | Toolbox duplication finders over `packages/` (pointers, not judges) |

## The pin matrix

| Behaviour | Pin (test) | Where | How it is watched red |
| --- | --- | --- | --- |
| No second source of randomness | `pins > randomness` | `test/pins.test.ts` | appended `Math.random()` to `compose/generators/bass.ts` → RED (watched 2026-10-14, file hash f109794b → fd777247, restored to f109794b) |
| One voice class | `pins > one voice architecture` | `test/pins.test.ts` | add `class FooSynth` anywhere in engine |
| Instruments/styles are data | `pins > instruments are data`, `pins > styles are data` | `test/pins.test.ts` | add a function to a patch file |
| Every patch sounds | `instruments.test > patch %s makes finite, audible, bounded sound` | `packages/engine/test/instruments.test.ts` | set a patch level to 0 |
| Determinism | `composer.test > is deterministic`, `engine.test > is deterministic` | engine tests | use a non-seeded source |
| Output never clips | `engine.test > renders finite audio that never exceeds full scale` | engine tests | bypass the limiter |
| Every param is an accessible control | `ui.test > every engine parameter becomes a named, described control` | `packages/ui/test/ui.test.ts` | drop the label `for` |

| The app starts, plays, draws and answers the keyboard; every scene is selectable in the Visuals panel and draws; no HTTP error | `npm run e2e` | `scripts/e2e.mjs` | drop `.pm-root [hidden]` (hidden panels show); remove the favicon link (404 → RED, watched 2026-10-15) |

## Per landing

Recorded in commit messages and the board.

- 2026-10-14 · web host, UI, visuals and app: `npm test` 151 vitest + 45 tools tests green; gate GREEN (both tiers); e2e GREEN (11 checks).
- 2026-10-15 · Light cycles scene: `npm test` 152 vitest + 45 tools tests green; gate GREEN (both tiers); e2e GREEN (18 checks, every scene draws).
