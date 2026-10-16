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
| A seed (any number → valid seed) | `seedFrom(entropy)` / `SEED_LIMIT`; the app's fresh start feeds it `crypto.getRandomValues`, New idea feeds it a hash | `packages/engine/src/engine/paramSpecs.ts` | `pins: the seed range`, `engine.test: seedFrom` |
| A controllable value | `ParamSpec` declared in `buildParamSpecs()`; ids via `P` | `packages/engine/src/engine/paramSpecs.ts` | `pins: param ids` |
| Binding UI to values | `ParamSource` interface (ParamStore, WebEngine implement it) | `packages/engine/src/core/params.ts` | — |
| Param → widget | `createControl(spec, source)` | `packages/ui/src/controls.ts` | `ui.test: every engine parameter becomes a named, described control` |
| Many params → panel body | `createParamView` (groups, advanced disclosure, filter) | `packages/ui/src/paramView.ts` | ui tests |
| A sound | a `Patch` (data) rendered by `Voice` | `instruments/patch.ts`, `instruments/voice.ts` | `pins: one voice architecture`, `pins: instruments are data` |
| Decay time ("falls 60 dB in T seconds") | `t60Gain` | `packages/engine/src/core/math.ts` | `instruments.test: fades one oscillator on its own clock` |
| An instrument's body (fixed resonant peaks) | `Patch.formant`, rendered by `Voice` | `instruments/patch.ts`, `instruments/voice.ts` | `instruments.test: formant peaks are unity gain` |
| Polyphony/stealing | `Instrument` | `instruments/instrument.ts` | `instruments.test: steals voices` |
| A genre | a `Style` (data) validated by `validateStyle`, in a family file (`electronic.ts`, `chill.ts`, `world.ts`) listed once in `BUILTIN_STYLES`; the picker, shortcuts and the journey follow from `STYLES` | `compose/style.ts`, `compose/styles/` | `pins: styles are data`, `composer.test: style catalogue` (every patch is some style's default; every two styles differ in ≥ 3 parts) |
| A shared song form or harmony table | `base.ts` (`DEFAULT_FORM`, `GROOVE_FORM`, `DRIFT_FORM`, `MINOR_POP`, `MAJOR_POP`, `MODAL`, `JAZZY`) | `compose/styles/base.ts` | — |
| Moving on to another style (the journey) | `Composer.planKind`: when `journey()` bars have passed it plays an outro, then starts the next piece in a new style (fresh themes, new auto key) and reports `styleChange`; `EngineCore.adoptJourneyStyle` applies it at that bar line | `compose/composer.ts`, `engine/core.ts` | `composer.test: moves on to a new style`, `engine.test: moves on to a new style by itself` |
| Swapping an instrument without cutting its notes | `Mixer.setInstrument` keeps the old one as `retiring` until its tails die | `mix/mixer.ts` | `engine.test: a new instrument lets the old one ring out` |
| Swing + humanize | `noteAt()` / `stepToBeat()` | `compose/rhythm.ts` | `pins: swing and humanize` |
| Saturation | `softClip` / `drive` | `dsp/shape.ts` | `pins: saturation` |
| Rendering audio | `EngineCore.process` (live worklet AND offline) | `engine/core.ts` | engine tests |
| "What is the music doing" for consumers | `MusicStateTracker` | `state/tracker.ts` | tracker tests |
| Thread messages | `parseToProcessor` / `parseFromProcessor` | `packages/web/src/protocol.ts` | protocol tests |
| Panel layout (floating windows vs. one sheet on phones) | `Workspace` picks the mode (`SHEET_QUERY`, or `layout` option) and owns the open sheet; `FloatingPanel.setLayout` applies it; CSS under `.pm-sheet` places it | `packages/ui/src/workspace.ts`, `panel.ts`, `styles.ts` | `ui.test: small screens show one panel at a time`, e2e: phone portrait/landscape |
| Starting audio (gesture unlock, iOS silent switch, resume after interruption) | `WebEngine.create` (call it inside the tap) and its `wake` listener | `packages/web/src/webEngine.ts` | — (needs a real phone) |
| Showing an error | `ErrorSurface.show` (one per workspace) | `packages/ui/src/errors.ts` | ui tests |
| Building DOM | `h()` | `packages/ui/src/dom.ts` | — |
| Hiding UI | the `hidden` attribute; ONE CSS rule `.pm-root [hidden]` honours it | `packages/ui/src/styles.ts` | e2e: default panels |
| Slider keyboard step | `nextSliderValue` (next distinct value, page = a tenth) | `packages/ui/src/format.ts` | `ui.test: arrow keys move a slider` |
| Music → visual drivers | `mapping.ts` (MusicState → uniforms inputs) | `packages/visuals/src/mapping.ts` | visuals tests |
| Flash limiting | `flash.ts` (always on; flashes default off) | `packages/visuals/src/flash.ts` | visuals tests |
| Scene choice/crossfade | `director.ts` | `packages/visuals/src/director.ts` | visuals tests |
| A visual scene | a `SceneDef` file in `scenes/`, listed ONCE in `SCENES`; the Scene picker, Automatic rotation, compilation and the e2e scene loop all follow from that list | `packages/visuals/src/scenes/registry.ts` | `glsl.test`, e2e: every scene draws |
| Shared GLSL | the prelude, prepended to every scene | `packages/visuals/src/glsl/prelude.ts` | — |
| Browser smoke | `npm run e2e` (build, serve dist, headless Chromium) | `scripts/e2e.mjs` | — |

## 3 · Gotchas

- **Styles reset the mix.** Changing `music.style` applies that style's tempo, swing,
  instruments and mix (`styleDefaults`), and the engine announces each change as a
  `param` event so mirrors (WebEngine, UI) follow. A preset applies `music.style` first
  for that reason (`apps/procmuse/src/presets.ts`). The journey (`music.journey`,
  default Sometimes = every ~64 bars) changes the style by itself, so hand-made
  instrument choices last until the next piece; set Style changes to Never to keep them.
- **A bass/chord pattern name must not equal a style id**: the styles-are-data pin
  greps generators for quoted style ids (a `'dub'` bass pattern tripped it; it is `'riddim'`).
- **Engine time vs. heard time.** Events carry engine-clock seconds at render time.
  `WebEngine.musicState()` maps the context's output timestamp back to engine time
  using the offset the processor reports, so visuals line up with what is *heard*.
- **Composer lookahead is half a beat.** Macro changes reach the music at the next bar.
- **Package entry points use the `source` export condition** (Vite, Vitest and `tsc`
  are configured for it), so apps and tests run from TypeScript sources; `dist/` is
  for publishing.
- **Two kinds of decay in a patch.** `amp` shapes the whole note; `OscBase.fade` lets one
  oscillator die on its own (a bell's high partials, an organ's chiff) while the others
  ring on. A patch has up to `MAX_OSCILLATORS` (6) oscillators.
- **`pitchEnv.semitones` may be negative**: the note scoops up into pitch (horns,
  conch); positive drops into it (drums).
- **A WebGL canvas reads back blank** (no `preserveDrawingBuffer`, by design for speed):
  judge rendering from a page screenshot, as `scripts/e2e.mjs` does.
- **Raymarch distance clamps must stay above the hit threshold.** A scene that caps
  its distance (e.g. at a domain-repetition cell border, `scenes/tron.ts`) reads the
  cap as a surface once `0.001 + k·t` exceeds it: ghost walls in the distance.
- **Any 404 fails the e2e**, the browser's own `favicon.ico` request included, so the
  app declares an inline favicon in `apps/procmuse/index.html`.
- **Touch sizing lives in ONE `@media (pointer: coarse)` block** in `styles.ts` (44 px targets, 16 px inputs so iOS does not zoom); the e2e fails any tap target under 40 px on the phone viewport.
- **Hover styles sit behind `@media (hover: hover)`**, or they stick after a tap on phones.
- **The app builds into repo-root `dist/`** with relative asset paths and ships
  `public/futuremagic.json`, matching how the owner's hub publishes apps.

## 4 · Known debt

- Mix balance and patch voicing were tuned by measurement, not by ear; they need a
  listening pass.
- No sample-based instruments yet: the `OscSpec` union is where a `sample` type goes.
- Meter is fixed at 4/4.
