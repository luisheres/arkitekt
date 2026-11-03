/** Modal dialogs: meeting a client, and their verdict on a design. */

import { type Client, type Verdict, num } from "../core";
import { esc, money } from "./hud";
import { lang, m } from "./i18n";

const modal = (): HTMLElement => document.querySelector<HTMLElement>("#modal")!;

/** Show `html` in the modal; buttons with `data-action` call the matching handler and close it. */
function open(html: string, actions: Record<string, () => void>, dismissable: boolean): void {
  const root = modal();
  root.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">${html}</div>`;
  root.hidden = false;
  const close = () => {
    root.hidden = true;
    root.innerHTML = "";
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && dismissable) {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener("keydown", onKey, true);
  for (const b of root.querySelectorAll<HTMLButtonElement>("button[data-action]")) {
    b.addEventListener("click", () => {
      close();
      actions[b.dataset.action!]?.();
    });
  }
  root.querySelector<HTMLButtonElement>("button.primary")?.focus();
}

export function isModalOpen(): boolean {
  return !modal().hidden;
}

/** Plot size as "28 × 32 m". */
export const plotSize = (c: Client): string => `${num(m, c.plot.width)} × ${num(m, c.plot.depth)} m`;

/** Introduce a client and their brief. */
export function showClient(client: Client, working: boolean, onAccept: () => void): void {
  const text = client.text[lang];
  const list = (must: boolean) =>
    client.items
      .filter((i) => i.must === must)
      .map((i) => `<li>${esc(m.requirement(i.req))}</li>`)
      .join("");
  open(
    `<p class="eyebrow">${esc(working ? m.ui.theBrief : m.ui.newClient)}</p>
     <h2>${esc(text.name)}</h2>
     <p class="sub">${esc(text.who)}</p>
     <blockquote>${esc(text.story)}</blockquote>
     <dl class="facts">
       <div><dt>${esc(m.ui.plot)}</dt><dd>${esc(client.plot.name[lang])}, ${plotSize(client)}</dd></div>
       <div><dt>${esc(m.ui.budget)}</dt><dd>${money(client.budget)}</dd></div>
     </dl>
     <div class="columns">
       <div><h3>${esc(m.ui.mustHave)}</h3><ul>${list(true)}</ul></div>
       <div><h3>${esc(m.ui.wouldLove)}</h3><ul>${list(false)}</ul></div>
     </div>
     <p class="sub">${esc(m.ui.briefFooter)}</p>
     <div class="actions"><button type="button" class="primary" data-action="accept">${esc(working ? m.ui.backToDrawingBoard : m.ui.takeJob)}</button></div>`,
    { accept: onAccept },
    working,
  );
}

/** The client's reaction to a presented design. */
export function showVerdict(client: Client, v: Verdict, onNext: () => void): void {
  const name = esc(client.text[lang].name);
  if (!v.accepted) {
    const shown = v.problems.slice(0, 8);
    const more = v.problems.length - shown.length;
    open(
      `<p class="eyebrow">${name}</p>
       <h2>${esc(m.ui.notYet)}</h2>
       <blockquote>${esc(v.quote)}</blockquote>
       <ul class="problems">${shown.map((p) => `<li>${esc(p)}</li>`).join("")}${more > 0 ? `<li class="sub">${esc(m.ui.andMore(more))}</li>` : ""}</ul>
       <div class="actions"><button type="button" class="primary" data-action="close">${esc(m.ui.keepWorking)}</button></div>`,
      {},
      true,
    );
    return;
  }
  const stars = "★".repeat(v.stars) + "☆".repeat(3 - v.stars);
  open(
    `<p class="eyebrow">${name}</p>
     <h2>${esc(m.ui.sold)} <span class="stars" aria-label="${esc(m.ui.stars(v.stars))}">${stars}</span></h2>
     <blockquote>${esc(v.quote)}</blockquote>
     <dl class="facts">
       <div><dt>${esc(m.ui.wishesGranted)}</dt><dd>${esc(m.brief.countOf(v.wishesMet, v.wishesTotal))}</dd></div>
       <div><dt>${esc(m.ui.yourFee)}</dt><dd>${money(v.fee)}</dd></div>
     </dl>
     <div class="actions"><button type="button" class="primary" data-action="next">${esc(m.ui.nextClient)}</button></div>`,
    { next: onNext },
    false,
  );
}
