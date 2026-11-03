/** Undo/redo over house snapshots. */

import type { HouseJson } from "./model";

/** Edits with the same key this close together collapse into one undo step (e.g. slider drags). */
const MERGE_WINDOW_MS = 1500;

export class History {
  private past: HouseJson[] = [];
  private future: HouseJson[] = [];
  private lastKey: string | null = null;
  private lastTime = 0;

  constructor(private readonly limit = 200) {}

  /**
   * Remember `before`, the state just before an edit. Consecutive edits that pass the
   * same `mergeKey` within a short time share one undo step.
   */
  record(before: HouseJson, mergeKey?: string, now = Date.now()): void {
    const merge = mergeKey !== undefined && mergeKey === this.lastKey && now - this.lastTime < MERGE_WINDOW_MS;
    this.lastKey = mergeKey ?? null;
    this.lastTime = now;
    if (merge) return;
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  /** The state to go back to, given the current one; null when there is nothing to undo. */
  undo(current: HouseJson): HouseJson | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(current);
    this.lastKey = null;
    return prev;
  }

  redo(current: HouseJson): HouseJson | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    this.lastKey = null;
    return next;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }
}
