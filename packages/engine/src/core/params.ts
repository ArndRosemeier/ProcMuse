/**
 * Declared parameters: THE control surface of the engine.
 *
 * Every user-controllable value is a ParamSpec with metadata (label, help text,
 * group, range, unit). The UI is generated from these specs, presets are
 * snapshots of them, and other apps drive the engine through them. Specs are
 * plain data (no functions) so they survive postMessage to another thread.
 */
import { ProcMuseError } from './errors.js';

interface ParamBase {
  /** Stable dotted id, e.g. `part.bass.level`. */
  id: string;
  label: string;
  /** One sentence for tooltips and screen readers. */
  description: string;
  /** UI grouping, e.g. `Music`, `Mix`, `Part: Bass`. */
  group: string;
  /** Hidden behind progressive disclosure in the UI. */
  advanced?: boolean;
}

export interface NumberParamSpec extends ParamBase {
  kind: 'number';
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
  /** How a control should map its travel onto the range. */
  scale?: 'linear' | 'log';
}

export interface EnumOption {
  value: string;
  label: string;
  description?: string;
}

export interface EnumParamSpec extends ParamBase {
  kind: 'enum';
  options: EnumOption[];
  default: string;
}

export interface BoolParamSpec extends ParamBase {
  kind: 'bool';
  default: boolean;
}

export type ParamSpec = NumberParamSpec | EnumParamSpec | BoolParamSpec;
export type ParamValue = number | string | boolean;
export type ParamValues = Record<string, ParamValue>;

/** Validates one value against its spec and returns the normalized value. Throws loudly. */
export function validateParamValue(spec: ParamSpec, value: unknown): ParamValue {
  switch (spec.kind) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ProcMuseError('invalid-param-value', `${spec.id}: expected a finite number, got ${String(value)}`);
      }
      if (value < spec.min || value > spec.max) {
        throw new ProcMuseError('invalid-param-value', `${spec.id}: ${value} is outside [${spec.min}, ${spec.max}]`);
      }
      return value;
    }
    case 'enum': {
      if (typeof value !== 'string' || !spec.options.some((o) => o.value === value)) {
        throw new ProcMuseError(
          'invalid-param-value',
          `${spec.id}: ${String(value)} is not one of ${spec.options.map((o) => o.value).join(', ')}`,
        );
      }
      return value;
    }
    case 'bool': {
      if (typeof value !== 'boolean') {
        throw new ProcMuseError('invalid-param-value', `${spec.id}: expected a boolean, got ${String(value)}`);
      }
      return value;
    }
  }
}

export type ParamListener = (id: string, value: ParamValue) => void;

/**
 * Anything that exposes declared parameters. The UI binds to this one shape,
 * whether the values live in this thread (ParamStore) or another (WebEngine).
 */
export interface ParamSource {
  readonly specs: readonly ParamSpec[];
  get(id: string): ParamValue;
  set(id: string, value: ParamValue): void;
  onParam(fn: ParamListener): () => void;
}

/** Holds the current value of every declared parameter. */
export class ParamStore implements ParamSource {
  readonly specs: readonly ParamSpec[];
  private readonly byId = new Map<string, ParamSpec>();
  private readonly values = new Map<string, ParamValue>();
  private readonly listeners = new Set<ParamListener>();

  constructor(specs: readonly ParamSpec[]) {
    for (const spec of specs) {
      if (this.byId.has(spec.id)) throw new ProcMuseError('internal', `duplicate param id ${spec.id}`);
      this.byId.set(spec.id, spec);
      this.values.set(spec.id, validateParamValue(spec, spec.default));
    }
    this.specs = specs;
  }

  spec(id: string): ParamSpec {
    const spec = this.byId.get(id);
    if (!spec) throw new ProcMuseError('unknown-param', `unknown parameter ${id}`);
    return spec;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): ParamValue {
    this.spec(id);
    return this.values.get(id) as ParamValue;
  }

  number(id: string): number {
    const v = this.get(id);
    if (typeof v !== 'number') throw new ProcMuseError('internal', `${id} is not a number param`);
    return v;
  }

  string(id: string): string {
    const v = this.get(id);
    if (typeof v !== 'string') throw new ProcMuseError('internal', `${id} is not an enum param`);
    return v;
  }

  bool(id: string): boolean {
    const v = this.get(id);
    if (typeof v !== 'boolean') throw new ProcMuseError('internal', `${id} is not a bool param`);
    return v;
  }

  set(id: string, value: unknown): void {
    const v = validateParamValue(this.spec(id), value);
    if (this.values.get(id) === v) return;
    this.values.set(id, v);
    for (const fn of this.listeners) fn(id, v);
  }

  /** Applies many values atomically: all are validated before any is applied. */
  apply(values: Readonly<Record<string, unknown>>): void {
    const validated: [string, ParamValue][] = [];
    for (const [id, value] of Object.entries(values)) validated.push([id, validateParamValue(this.spec(id), value)]);
    for (const [id, v] of validated) this.set(id, v);
  }

  snapshot(): ParamValues {
    return Object.fromEntries(this.values);
  }

  onParam(fn: ParamListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
