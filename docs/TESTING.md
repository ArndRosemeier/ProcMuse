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
| Oscillator fade and formant gain | `instruments.test > fades one oscillator…`, `> formant peaks are unity gain…` | `packages/engine/test/instruments.test.ts` | dropped the fade multiply and the peak normalization → both RED (watched 2026-10-15) |
| Recorded instruments, casting, the shipped files | `samples.test` (repitch, loop, one-shot, range fold, loud missing samples, casting monotone in the amount, every collection renders, index ↔ files ↔ patches agree, every shipped file decodes with the engine's decoder) | `packages/engine/test/samples.test.ts` | |
| The FLAC decoder | `flac.test` (stereo decorrelation, 24-bit, fixed/LPC/constant subframes, MD5-verified fixtures, loud on damage) | `packages/engine/test/flac.test.ts`, fixtures in `test/fixtures/flac/` | |
| Every param is an accessible control | `ui.test > every engine parameter becomes a named, described control` | `packages/ui/test/ui.test.ts` | drop the label `for` |

| The app starts, plays, draws and answers the keyboard; every scene is selectable in the Visuals panel and draws; the Band panel switches instruments; no HTTP error | `npm run e2e` | `scripts/e2e.mjs` | drop `.pm-root [hidden]` (hidden panels show); remove the favicon link (404 → RED, watched 2026-10-15) |

## Per landing

Recorded in commit messages and the board.

- 2026-10-14 · web host, UI, visuals and app: `npm test` 151 vitest + 45 tools tests green; gate GREEN (both tiers); e2e GREEN (11 checks).
- 2026-10-15 · Light cycles scene: `npm test` 152 vitest + 45 tools tests green; gate GREEN (both tiers); e2e GREEN (18 checks, every scene draws).
- 2026-10-15 · wow-factor instruments (ledger 12): `npm test` 171 vitest + 45 tools tests green; gate GREEN (both tiers); e2e GREEN (20 checks, incl. the Band panel offering and playing the bagpipes).
- 2026-10-15 · Dusk ride scene (ledger 14): `npm test` 173 vitest + 45 tools tests green; gate GREEN (both tiers); e2e GREEN (33 checks, every scene draws, phone portrait+landscape). The director test now derives its rotation from the scene count (it hard-coded four sections and broke at six scenes).
- 2026-10-16 · recorded-instrument collections (ledger 18): `npm test` 209 vitest + 45 tools tests green; gate GREEN (both tiers); e2e GREEN (incl. a collection downloading, decoding and playing after one press).
