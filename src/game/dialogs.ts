/** Modal dialogs: meeting a client, and their verdict on a design. */

import { type Client, type Verdict, describeRequirement } from "../core";
import { esc, money } from "./hud";

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

/** Introduce a client and their brief. */
export function showClient(client: Client, working: boolean, onAccept: () => void): void {
  const list = (must: boolean) =>
    client.items
      .filter((i) => i.must === must)
      .map((i) => `<li>${esc(describeRequirement(i.req))}</li>`)
      .join("");
  open(
    `<p class="eyebrow">${working ? "The brief" : "A new client"}</p>
     <h2>${esc(client.name)}</h2>
     <p class="sub">${esc(client.who)}</p>
     <blockquote>${esc(client.story)}</blockquote>
     <dl class="facts">
       <div><dt>Plot</dt><dd>${esc(client.plot.name)}, ${client.plot.width} × ${client.plot.depth} m</dd></div>
       <div><dt>Budget</dt><dd>${money(client.budget)}</dd></div>
     </dl>
     <div class="columns">
       <div><h3>Must have</h3><ul>${list(true)}</ul></div>
       <div><h3>Would love</h3><ul>${list(false)}</ul></div>
     </div>
     <p class="sub">Meet every must-have, stay within budget and fix all building problems to make the sale. Each wish you grant raises your fee.</p>
     <div class="actions"><button type="button" class="primary" data-action="accept">${working ? "Back to the drawing board" : "Take the job"}</button></div>`,
    { accept: onAccept },
    working,
  );
}

/** The client's reaction to a presented design. */
export function showVerdict(client: Client, v: Verdict, onNext: () => void): void {
  if (!v.accepted) {
    const shown = v.problems.slice(0, 8);
    const more = v.problems.length - shown.length;
    open(
      `<p class="eyebrow">${esc(client.name)}</p>
       <h2>Not quite yet</h2>
       <blockquote>${esc(v.quote)}</blockquote>
       <ul class="problems">${shown.map((p) => `<li>${esc(p)}</li>`).join("")}${more > 0 ? `<li class="sub">…and ${more} more</li>` : ""}</ul>
       <div class="actions"><button type="button" class="primary" data-action="close">Keep working</button></div>`,
      {},
      true,
    );
    return;
  }
  const stars = "★".repeat(v.stars) + "☆".repeat(3 - v.stars);
  open(
    `<p class="eyebrow">${esc(client.name)}</p>
     <h2>Sold! <span class="stars" aria-label="${v.stars} of 3 stars">${stars}</span></h2>
     <blockquote>${esc(v.quote)}</blockquote>
     <dl class="facts">
       <div><dt>Wishes granted</dt><dd>${v.wishesMet} of ${v.wishesTotal}</dd></div>
       <div><dt>Your fee</dt><dd>${money(v.fee)}</dd></div>
     </dl>
     <div class="actions"><button type="button" class="primary" data-action="next">Next client</button></div>`,
    { next: onNext },
    false,
  );
}
