/** Persistence for UI preferences. Storage is optional enrichment: when it is unavailable, preferences simply do not persist. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function browserStore(prefix = 'procmuse:'): KeyValueStore {
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
    storage.getItem('probe');
  } catch {
    storage = null; // private mode or blocked: preferences are session-only (documented, not an error)
  }
  const memory = new Map<string, string>();
  return {
    get: (key) => (storage ? storage.getItem(prefix + key) : (memory.get(key) ?? null)),
    set: (key, value) => {
      if (storage) storage.setItem(prefix + key, value);
      else memory.set(key, value);
    },
  };
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
}
