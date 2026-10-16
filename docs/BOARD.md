# The board — what is happening right now

The state of record; one screen, overwritten in place. Reconcile with `bash scripts/board.sh`.

```
reconciled: SEE_GIT · 2026-10-16

SESSION | id=claude-projects thread "random seed on start" | state=landed: fresh seed per start (ledger 15)

LANDED | ledger=15 | fresh seed on every app start; share links and the Seed control still pin one (gate GREEN, e2e GREEN)

LANDED | ledger=14 | Dusk ride scene: fast motorbike ride, wireframe mountains and palms, mirror road (gate GREEN, e2e GREEN)

LANDED | ledger=13 | phone layout: one sheet above a full-width dock, touch sizing, audio unlock on tap (gate GREEN, e2e GREEN incl. phone portrait+landscape)

LANDED | ledger=12 | wow-factor instruments: horns, bells, organs, bagpipes, choir, taiko, gong (gate GREEN, e2e GREEN)

QUEUE | row=8 | listening pass on mix balance and patches, incl. the 16 new ones (needs the owner's ears) | src=docs/ARCHITECTURE.md#known-debt
QUEUE | row=9 | sample-based instruments (piano, strings, voice) as an OscSpec type | src=ledger row 3
QUEUE | row=10 | publish @procmuse/engine to npm (build dist, versioning) | src=README.md

RECOVERY | repo=https://github.com/ArndRosemeier/ProcMuse | branch=main | gate=bash scripts/gate.sh | e2e=npm run e2e
```

## Guards

- **`GUARD` — the suite lock.** `scripts/gate.sh` takes an atomic `mkdir` lock; a second run is refused (exit 9) and is VOID.
- **`GUARD` — architecture pins.** `test/pins.test.ts` reds on a second PRNG, a second voice class, code in patch/style data, swing outside `rhythm.ts`, a DOM/Web Audio reference in the engine, or hand-spelled param ids.

## Traps

- `TRAP` — a test file named in a vitest filter matched every path containing it (`vitest run test` ran the whole suite). Rule: run a file by its full path.
