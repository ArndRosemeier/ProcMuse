/** ADSR envelope with linear attack and exponential decay/release. Times in seconds. */

export interface AdsrSpec {
  attack: number;
  decay: number;
  /** 0..1 */
  sustain: number;
  release: number;
}

const enum Stage {
  Idle,
  Attack,
  Decay,
  Sustain,
  Release,
}

export class Adsr {
  value = 0;
  private stage = Stage.Idle;
  private attackInc = 1;
  private decayCoef = 0;
  private releaseCoef = 0;
  private sustain = 1;

  configure(spec: AdsrSpec, sampleRate: number): void {
    this.attackInc = 1 / Math.max(1, spec.attack * sampleRate);
    // reach ~99.9% of the way in the given time
    this.decayCoef = Math.exp(-6.9 / Math.max(1, spec.decay * sampleRate));
    this.releaseCoef = Math.exp(-6.9 / Math.max(1, spec.release * sampleRate));
    this.sustain = spec.sustain;
  }

  gateOn(): void {
    this.stage = Stage.Attack;
  }

  gateOff(): void {
    if (this.stage !== Stage.Idle) this.stage = Stage.Release;
  }

  get idle(): boolean {
    return this.stage === Stage.Idle;
  }

  get released(): boolean {
    return this.stage === Stage.Release || this.stage === Stage.Idle;
  }

  next(): number {
    switch (this.stage) {
      case Stage.Idle:
        return 0;
      case Stage.Attack:
        this.value += this.attackInc;
        if (this.value >= 1) {
          this.value = 1;
          this.stage = Stage.Decay;
        }
        return this.value;
      case Stage.Decay:
        this.value = this.sustain + (this.value - this.sustain) * this.decayCoef;
        if (this.value - this.sustain < 1e-4) {
          this.value = this.sustain;
          this.stage = this.sustain <= 1e-4 ? Stage.Idle : Stage.Sustain;
        }
        return this.value;
      case Stage.Sustain:
        return this.value;
      case Stage.Release:
        this.value *= this.releaseCoef;
        if (this.value < 1e-4) {
          this.value = 0;
          this.stage = Stage.Idle;
        }
        return this.value;
    }
  }

  reset(): void {
    this.value = 0;
    this.stage = Stage.Idle;
  }
}
