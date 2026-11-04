/**
 * The pop-up menu that opens where you click: it shows the inspector for the current
 * selection, follows it as it changes, and closes when nothing is selected, on Escape,
 * or when clicking elsewhere.
 */

import { type Inspector, buildInspector, inspectorKey } from "./inspector";
import type { Store } from "./store";
import { el } from "./ui";

export class Popover {
  private readonly root: HTMLElement;
  private inspector: Inspector | null = null;
  private key = "";
  private anchor = { x: 0, y: 0 };

  constructor(private readonly store: Store) {
    this.root = el("div", { className: "popover", hidden: true, role: "dialog" });
    document.body.append(this.root);
    store.subscribe(() => this.sync());
    // Clicks elsewhere close the menu, except on the plan and 3D view, which open a
    // new one (or close it) themselves.
    document.addEventListener("pointerdown", (e) => {
      const t = e.target as HTMLElement;
      if (this.root.hidden || this.root.contains(t) || t.closest("#plan svg, #view, .opens-menu")) return;
      this.close();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Show the menu for the current selection near (x, y), in page coordinates. */
  open(x: number, y: number): void {
    this.anchor = { x, y };
    this.key = "";
    this.root.hidden = false;
    this.sync();
  }

  close(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.inspector = null;
    this.key = "";
  }

  private sync(): void {
    if (this.root.hidden) return;
    const sel = this.store.selection;
    if (!sel) return this.close();
    const key = inspectorKey(this.store);
    if (key !== this.key) {
      this.key = key;
      this.inspector = buildInspector(this.store, sel);
      if (!this.inspector) return this.close();
      const close = el("button", { type: "button", className: "icon close", ariaLabel: "Close" }, "×");
      close.addEventListener("click", () => this.close());
      this.root.replaceChildren(close, this.inspector.el);
      this.place();
    }
    for (const f of this.inspector?.fields ?? []) f.update();
  }

  /** Put the menu beside the click, kept inside the window. */
  private place(): void {
    const { x, y } = this.anchor;
    const r = this.root.getBoundingClientRect();
    const margin = 8;
    const left = x + 16 + r.width > window.innerWidth - margin ? Math.max(margin, x - 16 - r.width) : x + 16;
    const top = Math.min(Math.max(margin, y - 24), Math.max(margin, window.innerHeight - r.height - margin));
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }
}
