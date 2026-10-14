/** Minimal typed event emitter: the one listener mechanism in the engine. */
export class Emitter<Events extends Record<string, unknown>> {
  private listeners: { [K in keyof Events]?: Set<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void): () => void {
    let set = this.listeners[type];
    if (!set) {
      set = new Set();
      this.listeners[type] = set;
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.listeners[type];
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  clear(): void {
    this.listeners = {};
  }
}
