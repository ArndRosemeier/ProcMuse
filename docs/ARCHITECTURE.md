# Architecture — the seam index

## 1 · Layer map

Dependencies point down only. `engine` is headless and has no runtime dependencies.

| Layer | Package | Role |
| --- | --- | --- |
| app | `apps/procmuse` | Start screen, panel layout, presets/share links, shortcuts; glues the packages. Builds to repo-root `dist/`. |
| ui | `packages/ui` (`@procmuse/ui`) | Workspace, floating panels, dock, controls generated from `ParamSpec`, announcer, error surface, shortcuts. Knows nothing about music. |
| visuals | `packages/visuals` (`@procmuse/visuals`) | WebGL2 scenes driven by `MusicState`; declares `visual.*` params. |
| web | `packages/web` (`@procmuse/web`) | AudioWorklet processor hosting `EngineCore`; `WebEngine` main-thread facade (validated param mirror, events, `musicState()`). |
| engine | `packages/engine` (`@procmuse/engine`) | Composer → sequencer → voices → mixer, params, events, `MusicStateTracker`, offline render. |

Engine internals (`packages/engine/src`): `core/` (rng, params, errors, math, emitter) → `theory/` (pitch, scale, chord, progression) → `dsp/` (osc, filter, envelope, noise, pluck, delayline, effects, dynamics, shape) → `instruments/` (patch schema, the one voice, instrument pool, patch data) → `compose/` (parts, style schema, style data, rhythm, generators, composer) → `mix/` → `engine/` (param specs, queue, core, events) → `state/`, `render/`.

## 2 · The one way to do X

| Seam | The ONE way | Where | Pinned by |
| --- | --- | --- | --- |
| Randomness | `Rng` (+ `fork(label)` for stable independent streams) | `packages/engine/src/core/rng.ts` | `pins: randomness` (no `Math.random` in engine) |
| A controllable value | `ParamSpec` declared in `buildParamSpecs()`; ids via `P` | `packages/engine/src/engine/paramSpecs.ts` | `pins: param ids` |
| Binding UI to values | `ParamSource` interface (ParamStore, WebEngine implement it) | `packages/engine/src/core/params.ts` | — |
| Param → widget | `createControl(spec, source)` | `packages/ui/src/controls.ts` | `ui.test: every engine parameter becomes a named, described control` |
| Many params → panel body | `createParamView` (groups, advanced disclosure, filter) | `packages/ui/src/paramView.ts` | ui tests |
| A sound | a `Patch` (data) rendered by `Voice` | `instruments/patch.ts`, `instruments/voice.ts` | `pins: one voice architecture`, `pins: instruments are data` |
| Polyphony/stealing | `Instrument` | `instruments/instrument.ts` | `instruments.test: steals voices` |
| A genre | a `Style` (data) validated by `validateStyle` | `compose/style.ts`, `compose/styles/builtin.ts` | `pins: styles are data` |
| Swing + humanize | `noteAt()` / `stepToBeat()` | `compose/rhythm.ts` | `pins: swing and humanize` |
| Saturation | `softClip` / `drive` | `dsp/shape.ts` | `pins: saturation` |
| Rendering audio | `EngineCore.process` (live worklet AND offline) | `engine/core.ts` | engine tests |
| "What is the music doing" for consumers | `MusicStateTracker` | `state/tracker.ts` | tracker tests |
| Thread messages | `parseToProcessor` / `parseFromProcessor` | `packages/web/src/protocol.ts` | protocol tests |
| Showing an error | `ErrorSurface.show` (one per workspace) | `packages/ui/src/errors.ts` | ui tests |
| Building DOM | `h()` | `packages/ui/src/dom.ts` | — |
| Hiding UI | the `hidden` attribute; ONE CSS rule `.pm-root [hidden]` honours it | `packages/ui/src/styles.ts` | e2e: default panels |
| Slider keyboard step | `nextSliderValue` (next distinct value, page = a tenth) | `packages/ui/src/format.ts` | `ui.test: arrow keys move a slider` |
| Music → visual drivers | `mapping.ts` (MusicState → uniforms inputs) | `packages/visuals/src/mapping.ts` | visuals tests |
| Flash limiting | `flash.ts` (always on; flashes default off) | `packages/visuals/src/flash.ts` | visuals tests |
| Scene choice/crossfade | `director.ts` | `packages/visuals/src/director.ts` | visuals tests |
| Shared GLSL | the prelude, prepended to every scene | `packages/visuals/src/glsl/prelude.ts` | — |
| Browser smoke | `npm run e2e` (build, serve dist, headless Chromium) | `scripts/e2e.mjs` | — |

## 3 · Gotchas

- **Styles reset the mix.** Changing `music.style` applies that style's tempo, swing,
  instruments and mix (`styleDefaults`), and the engine announces each change as a
  `param` event so mirrors (WebEngine, UI) follow. A preset applies `music.style` first
  for that reason (`apps/procmuse/src/presets.ts`).
- **Engine time vs. heard time.** Events carry engine-clock seconds at render time.
  `WebEngine.musicState()` maps the context's output timestamp back to engine time
  using the offset the processor reports, so visuals line up with what is *heard*.
- **Composer lookahead is half a beat.** Macro changes reach the music at the next bar.
- **Package entry points use the `source` export condition** (Vite, Vitest and `tsc`
  are configured for it), so apps and tests run from TypeScript sources; `dist/` is
  for publishing.
- **A WebGL canvas reads back blank** (no `preserveDrawingBuffer`, by design for speed):
  judge rendering from a page screenshot, as `scripts/e2e.mjs` does.
- **The app builds into repo-root `dist/`** with relative asset paths and ships
  `public/futuremagic.json`, matching how the owner's hub publishes apps.

## 4 · Known debt

- Mix balance and patch voicing were tuned by measurement, not by ear; they need a
  listening pass.
- No sample-based instruments yet: the `OscSpec` union is where a `sample` type goes.
- Meter is fixed at 4/4.
