/** Small DOM helpers and form controls shared by the sidebar and the pop-up menus. */

import { fixed } from "../core";
import { m } from "./i18n";

/** A control and how to refresh it from the model. */
export interface Field {
  el: HTMLElement;
  update(): void;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

const isFocused = (e: Element) => document.activeElement === e;

/** A labelled slider with its value shown beside it. `get` returning null disables it. */
export function slider(label: string, o: { min: number; max: number; step: number; unit: string; digits: number }, get: () => number | null, set: (v: number) => void): Field {
  const input = el("input", { type: "range", min: String(o.min), max: String(o.max), step: String(o.step) });
  const output = el("output");
  input.addEventListener("input", () => set(Number(input.value)));
  return {
    el: el("label", { className: "field" }, el("span", {}, label), input, output),
    update() {
      const v = get();
      input.disabled = v === null;
      if (v !== null) input.value = String(v);
      output.textContent = v === null ? "–" : `${fixed(m, v, o.digits)}${o.unit}`;
    },
  };
}

/** A labelled number input for exact sizes, in meters. */
export function numberField(label: string, o: { min: number; max: number; step: number }, get: () => number, set: (v: number) => void): Field {
  const input = el("input", { type: "number", min: String(o.min), max: String(o.max), step: String(o.step) });
  input.addEventListener("input", () => {
    const v = Number(input.value);
    if (input.value !== "" && Number.isFinite(v)) set(v);
  });
  return {
    el: el("label", { className: "field" }, el("span", {}, label), input, el("output", {}, "m")),
    update() {
      if (!isFocused(input)) input.value = String(Number(get().toFixed(2)));
    },
  };
}

export function selectField<T extends string>(label: string, options: readonly { value: T; label: string }[], get: () => T | null, set: (v: T) => void): Field {
  const select = el("select", {}, ...options.map((o) => el("option", { value: o.value }, o.label)));
  select.addEventListener("change", () => {
    set(select.value as T);
    select.blur(); // so tool shortcuts don't keep changing the dropdown
  });
  return {
    el: el("label", { className: "field" }, el("span", {}, label), select),
    update() {
      const v = get();
      select.disabled = v === null;
      if (v !== null) select.value = v;
    },
  };
}

/** A read-only value row. */
export function readout(label: string, get: () => string): Field {
  const output = el("output");
  return { el: el("div", { className: "field" }, el("span", {}, label), output), update: () => (output.textContent = get()) };
}

/** Options for an enum, labelled from a catalog table. */
export const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((v) => ({ value: v, label: labels[v] }));

export interface Choice<T extends string> {
  value: T;
  label: string;
  /** A color dot, or an image (data URL) for a material swatch. */
  color?: string;
  image?: string;
}

/**
 * A grid of buttons to pick one value: quicker than a dropdown, and room for a swatch.
 * `get` returning null disables the grid.
 */
export function choices<T extends string>(label: string, items: readonly Choice<T>[], get: () => T | null, set: (v: T) => void, cls = ""): Field {
  const buttons = items.map((c) => {
    const b = el("button", { type: "button", className: `choice ${cls}`, title: c.label });
    if (c.image) b.append(el("span", { className: "swatch", style: `background-image:url(${c.image})` }));
    else if (c.color) b.append(el("span", { className: "dot", style: `background:${c.color}` }));
    b.append(el("span", { className: "choice-label" }, c.label));
    b.addEventListener("click", () => set(c.value));
    return b;
  });
  return {
    el: el("div", { className: "choices-field" }, el("div", { className: "choices-title" }, label), el("div", { className: `choices ${cls}` }, ...buttons)),
    update() {
      const v = get();
      buttons.forEach((b, i) => {
        b.disabled = v === null;
        b.classList.toggle("active", items[i].value === v);
      });
    },
  };
}

export function button(label: string, onClick: () => void, props: Record<string, unknown> = {}): HTMLButtonElement {
  const b = el("button", { type: "button", ...props }, label);
  b.addEventListener("click", onClick);
  return b;
}
