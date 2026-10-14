/** A binary min-heap of scheduled items ordered by beat, then by kind (offs before markers before ons). */
export const enum ItemKind {
  Off = 0,
  Marker = 1,
  On = 2,
}

export interface QueueItem {
  beat: number;
  kind: ItemKind;
  part: number;
  pitch: number;
  velocity: number;
  /** beats (note-ons only) */
  duration: number;
  marker: (() => void) | null;
}

function less(a: QueueItem, b: QueueItem): boolean {
  return a.beat < b.beat || (a.beat === b.beat && a.kind < b.kind);
}

export class EventQueue {
  private heap: QueueItem[] = [];

  get size(): number {
    return this.heap.length;
  }

  peek(): QueueItem | undefined {
    return this.heap[0];
  }

  push(item: QueueItem): void {
    const h = this.heap;
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(h[i] as QueueItem, h[p] as QueueItem)) break;
      [h[i], h[p]] = [h[p] as QueueItem, h[i] as QueueItem];
      i = p;
    }
  }

  pop(): QueueItem | undefined {
    const h = this.heap;
    const top = h[0];
    const last = h.pop();
    if (h.length && last) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && less(h[l] as QueueItem, h[m] as QueueItem)) m = l;
        if (r < h.length && less(h[r] as QueueItem, h[m] as QueueItem)) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m] as QueueItem, h[i] as QueueItem];
        i = m;
      }
    }
    return top;
  }

  /** Removes every item for which `drop` returns true. */
  filter(keep: (item: QueueItem) => boolean): void {
    const items = this.heap.filter(keep);
    this.heap = [];
    for (const it of items) this.push(it);
  }
}
