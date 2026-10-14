/**
 * The renderer: owns the WebGL2 context, the compiled scene programs, two
 * scene render targets (for crossfades and dynamic resolution) and the
 * composite pass. All decisions (uniforms, scene choice, fades, quality) are
 * made by the pure modules; this class only draws.
 */
import { ParamStore, type MusicState, type ParamSpec } from '@procmuse/engine';
import { initialDirector, resolveScene, stepDirector, type DirectorState } from './director.js';
import { VisualsError } from './errors.js';
import { createProgram, createTarget, deleteTarget, setUniforms, type Program, type RenderTarget } from './gl.js';
import { COMPOSITE_SOURCE } from './glsl/composite.js';
import { VERTEX_SOURCE } from './glsl/prelude.js';
import { initialMotion, mapUniforms, type MotionState } from './mapping.js';
import { buildVisualParamSpecs, readSettings } from './params.js';
import { initialAutoQuality, resolutionScale, stepAutoQuality, type AutoQualityState } from './quality.js';
import { SCENES, sceneSource, type SceneId } from './scenes/registry.js';

export interface VisualsOptions {
  /**
   * Default for the Reduce motion parameter. When omitted, the user's
   * `prefers-reduced-motion` media query is used where matchMedia exists.
   */
  reduceMotionDefault?: boolean;
  /** Cap on devicePixelRatio for the canvas backing store (default 2). */
  maxPixelRatio?: number;
}

/** Read once at construction; a genuine user preference, so absence of matchMedia means "no preference". */
function prefersReducedMotion(): boolean {
  const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  return typeof mm === 'function' ? mm.call(globalThis, '(prefers-reduced-motion: reduce)').matches : false;
}

export class Visuals {
  /** The visuals parameters; bind a UI to it (it is a ParamSource). */
  readonly params: ParamStore;
  readonly specs: readonly ParamSpec[];

  private readonly canvas: HTMLCanvasElement;
  private readonly maxPixelRatio: number;
  private gl: WebGL2RenderingContext;
  private programs = new Map<SceneId, Program>();
  private composite!: Program;
  private vao: WebGLVertexArrayObject | null = null;
  private targets: [RenderTarget, RenderTarget] | null = null;
  private motion: MotionState | null = null;
  private director: DirectorState | null = null;
  private auto: AutoQualityState = initialAutoQuality();
  private lastNow: number | null = null;
  private lost = false;
  private disposed = false;
  private readonly onLost = (e: Event) => {
    e.preventDefault(); // allows the browser to restore the context
    this.lost = true;
  };
  private readonly onRestored = () => {
    this.lost = false;
    this.targets = null;
    this.buildResources();
  };

  constructor(canvas: HTMLCanvasElement, options: VisualsOptions = {}) {
    this.canvas = canvas;
    this.maxPixelRatio = options.maxPixelRatio ?? 2;
    if (!(this.maxPixelRatio > 0)) throw new VisualsError('invalid-argument', `maxPixelRatio must be positive, got ${options.maxPixelRatio}`);
    this.specs = buildVisualParamSpecs({ reduceMotionDefault: options.reduceMotionDefault ?? prefersReducedMotion() });
    this.params = new ParamStore(this.specs);
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      throw new VisualsError('no-webgl2', 'The animated background needs WebGL2, which this browser or device does not provide (or has disabled).');
    }
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    this.buildResources();
    this.resize();
  }

  /** True while the browser has taken the GPU context away; frames are skipped until it is restored. */
  get contextLost(): boolean {
    return this.lost;
  }

  /** The scene currently on screen (the one being faded to, during a fade). */
  get currentScene(): SceneId | null {
    return this.director ? (this.director.to ?? this.director.from) : null;
  }

  /** The resolution scale scenes are rendered at (0..1 of the canvas). */
  get renderScale(): number {
    return resolutionScale(readSettings(this.params).quality, this.auto);
  }

  private buildResources(): void {
    const gl = this.gl;
    this.programs = new Map(SCENES.map((s) => [s.id, createProgram(gl, VERTEX_SOURCE, sceneSource(s), `scene ${s.id}`)]));
    this.composite = createProgram(gl, VERTEX_SOURCE, COMPOSITE_SOURCE, 'composite');
    this.vao = gl.createVertexArray();
    if (!this.vao) throw new VisualsError('gl-resource', 'could not create a vertex array (context lost?)');
  }

  /** Matches the canvas backing store to its CSS size. Called by every frame (cheap when nothing changed). */
  resize(): void {
    const dpr = Math.min((globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1, this.maxPixelRatio);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  /**
   * Draws one frame. `nowSeconds` is a monotonic wall clock (e.g.
   * `performance.now() / 1000`); it drives motion integration and the
   * automatic quality controller.
   */
  frame(state: MusicState, nowSeconds: number): void {
    if (this.disposed) throw new VisualsError('disposed', 'Visuals.frame called after dispose()');
    if (!Number.isFinite(nowSeconds)) throw new VisualsError('invalid-argument', `frame: nowSeconds must be finite, got ${nowSeconds}`);
    if (this.lastNow !== null && nowSeconds < this.lastNow) {
      throw new VisualsError('invalid-argument', `frame: nowSeconds went backwards (${this.lastNow} -> ${nowSeconds}); pass a monotonic clock`);
    }
    const rawDt = this.lastNow === null ? 0 : nowSeconds - this.lastNow;
    this.lastNow = nowSeconds;
    if (this.lost) return;

    const settings = readSettings(this.params);
    this.auto = stepAutoQuality(this.auto, rawDt);
    const mapped = mapUniforms(state, settings, rawDt, this.motion ?? initialMotion(state));
    this.motion = mapped.motion;
    const desired = resolveScene(settings.scene, state.section);
    this.director = stepDirector(this.director ?? initialDirector(desired), desired, rawDt, settings.crossfade);

    const gl = this.gl;
    this.resize();
    const scale = resolutionScale(settings.quality, this.auto);
    const tw = Math.max(1, Math.round(this.canvas.width * scale));
    const th = Math.max(1, Math.round(this.canvas.height * scale));
    const targets = this.ensureTargets(tw, th);

    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    const passes: [SceneId, RenderTarget][] = [[this.director.from, targets[0]]];
    if (this.director.to !== null) passes.push([this.director.to, targets[1]]);
    for (const [id, target] of passes) {
      const p = this.programs.get(id);
      if (!p) throw new VisualsError('invalid-argument', `no compiled program for scene ${id}`);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, tw, th);
      gl.useProgram(p.program);
      setUniforms(gl, p, mapped.uniforms);
      setUniforms(gl, p, { uResolution: [tw, th] });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.composite.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targets[0].texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.director.to !== null ? targets[1].texture : targets[0].texture);
    setUniforms(gl, this.composite, mapped.uniforms);
    setUniforms(gl, this.composite, {
      uResolution: [this.canvas.width, this.canvas.height],
      uFade: this.director.to !== null ? this.director.fade : 0,
      uSceneA: 0,
      uSceneB: 1,
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private ensureTargets(w: number, h: number): [RenderTarget, RenderTarget] {
    if (this.targets && this.targets[0].width === w && this.targets[0].height === h) return this.targets;
    if (this.targets) for (const t of this.targets) deleteTarget(this.gl, t);
    this.targets = [createTarget(this.gl, w, h, 'scene target A'), createTarget(this.gl, w, h, 'scene target B')];
    return this.targets;
  }

  /** Frees every GPU resource. The instance is unusable afterwards. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    const gl = this.gl;
    if (this.targets) for (const t of this.targets) deleteTarget(gl, t);
    for (const p of this.programs.values()) gl.deleteProgram(p.program);
    gl.deleteProgram(this.composite.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.targets = null;
    this.programs.clear();
  }
}
