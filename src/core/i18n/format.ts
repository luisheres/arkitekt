/** Number formatting for a language: decimal separators, digit grouping, units. */

import type { Messages } from "./types";

const cache = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, options);
    cache.set(key, f);
  }
  return f;
}

/** Up to `digits` decimals, trailing zeros dropped: 12.5, 12, 0.25. */
export function num(m: Messages, x: number, digits = 2): string {
  return formatter(m.locale, { maximumFractionDigits: digits }).format(x);
}

/** Exactly `digits` decimals: 12.0, 12.5. */
export function fixed(m: Messages, x: number, digits: number): string {
  return formatter(m.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x);
}

/** Whole money amounts with digit grouping: 42,150 or 42 150. */
export function money(m: Messages, x: number): string {
  return formatter(m.locale, { maximumFractionDigits: 0 }).format(x);
}

/** A measured area, one decimal: "12.5 m²". */
export function area(m: Messages, x: number): string {
  return `${fixed(m, x, 1)} m²`;
}

/** A round area from a rule or brief: "12 m²", "2.5 m²". */
export function m2(m: Messages, x: number): string {
  return `${num(m, x, 1)} m²`;
}

/** A length: "0.9 m". */
export function meters(m: Messages, x: number): string {
  return `${num(m, x, 2)} m`;
}

/** A share as a percentage: "85%" or "85 %". */
export function percent(m: Messages, share: number): string {
  return formatter(m.locale, { style: "percent", maximumFractionDigits: 0 }).format(share);
}
