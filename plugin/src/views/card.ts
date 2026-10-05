// Ported verbatim from obsidian-session-modal/src/card.ts (2026-08-30) — the first
// feature module of the unified JARVIS surface. Only the `./types` import path is
// unchanged (it resolves to the sibling ported types module). The renderer itself is
// untouched: it is the proven cockpit card and must stay bug-for-bug compatible.

import { LIVE_DOT, type LiveSession, type ProjectCard } from "./types";

/**
 * The cockpit's card renderer.
 *
 * The modal board draws its own cards inside `renderSuggestion`, which is bound to
 * FuzzySuggestModal's shape. This one is a plain element renderer so the docked leaf
 * and anything later can share it.
 *
 * Card body = the ledger (answer #11): `status:` from CONTINUE.md, with the first
 * `## Next` item under it. Never a machine summary of the pane -- the ledger is what
 * Sebastian actually wrote about the work, and it cannot hallucinate.
 */
export function renderCard(
  parent: HTMLElement,
  card: ProjectCard,
  opts: {
    greyed?: boolean;
    onPick?: (card: ProjectCard) => void;
    /** Focus this card's session in the inject line. Only offered when steerable. */
    onSteer?: (card: ProjectCard) => void;
    /** Attach a terminal. An explicit button, never the card body (R7). */
    onOpen?: (card: ProjectCard) => void;
    focused?: boolean;
    /**
     * One line: title, date, host. No status body, no NEXT. Used for the 51 cold
     * cards, which are a directory to pick from rather than work in flight -- their
     * full ledger buys nothing until you are actually choosing one (R2).
     */
    compact?: boolean;
  } = {},
): HTMLElement {
  const el = parent.createDiv({ cls: "cockpit-card" });
  const live = card.live ?? null;

  if (live) el.addClass(`cockpit-card--${live.status}`);
  else if (card.session) el.addClass("cockpit-card--unknown");
  else el.addClass("cockpit-card--cold");
  // A host we could not reach: the card is drawn from the ledger, but its liveness
  // is unknown and must not look like "nothing running".
  if (opts.greyed) el.addClass("cockpit-card--greyed");

  if (opts.compact) el.addClass("cockpit-card--compact");

  const head = el.createDiv({ cls: "cockpit-card-head" });
  head.createSpan({ cls: "cockpit-card-title", text: card.slug });

  const badge = head.createDiv({ cls: "cockpit-card-badge" });
  if (live) {
    badge.createSpan({
      cls: `cockpit-dot cockpit-dot--${live.status}`,
      text: LIVE_DOT[live.status],
    });
    badge.createSpan({ cls: "cockpit-card-state", text: live.status });
    badge.createSpan({
      cls: `cockpit-host cockpit-host--${live.host_key ?? "mac"}`,
      text: live.host_key ?? "?",
    });
    badge.createSpan({ cls: "cockpit-card-ago", text: agoLabel(live.ago_s) });
    // Injectability is a property of the SESSION, not of the project: a session
    // started outside tmux has no pane to send keys to. Say it on the card rather
    // than letting a later inject control fail silently.
    if (!live.injectable) {
      badge.createSpan({
        cls: "cockpit-tag cockpit-tag--monitor",
        text: "monitor-only",
      });
    }
    if (live.source === "capture") {
      badge.createSpan({
        cls: "cockpit-tag cockpit-tag--capture",
        text: "via pane",
      });
    }
  } else if (card.session) {
    badge.createSpan({ cls: "cockpit-dot cockpit-dot--unknown", text: "◍" });
    badge.createSpan({ cls: "cockpit-card-state", text: "up, no beacon" });
    badge.createSpan({
      cls: `cockpit-host cockpit-host--${card.session.host}`,
      text: card.session.host,
    });
    badge.createSpan({ cls: "cockpit-card-ago", text: card.session.ago });
    // A tmux session that has not emitted in days is a parked workspace, not work
    // in flight. Saying so on the card is the difference between "still going" and
    // "still there" (R3).
    if (isStaleAgo(card.session.ago)) {
      badge.createSpan({
        cls: "cockpit-tag cockpit-tag--stale",
        text: `⚠ stale ${card.session.ago}`,
      });
    }
  } else {
    badge.createSpan({ cls: "cockpit-dot cockpit-dot--cold", text: "○" });
    badge.createSpan({ cls: "cockpit-card-ago", text: card.updated || "—" });
    badge.createSpan({
      cls: `cockpit-host cockpit-host--${card.create_on}`,
      text: card.create_on,
    });
  }

  // A compact card drops the BODY, not its controls: the cold shelf is where you
  // start work you are not already doing, so it still needs a way to open one. Its
  // action row lives inline in the head instead of below the body.
  if (opts.compact) {
    if (opts.focused) el.addClass("cockpit-card--focused");
    if (opts.onPick) {
      el.addClass("cockpit-card--clickable");
      el.addEventListener("click", () => opts.onPick?.(card));
    }
    addActions(head, card, live, opts);
    return el;
  }

  el.createDiv({ cls: "cockpit-card-status", text: card.status || "—" });
  el.createDiv({ cls: "cockpit-card-next" }).createSpan({
    cls: card.next
      ? "cockpit-next-text"
      : "cockpit-next-text cockpit-next-text--none",
    text: card.next ? `NEXT → ${card.next}` : "NEXT → —",
  });

  if (opts.focused) el.addClass("cockpit-card--focused");

  if (opts.onPick) {
    el.addClass("cockpit-card--clickable");
    el.addEventListener("click", () => opts.onPick?.(card));
  }

  addActions(el, card, live, opts);
  return el;
}

/**
 * R7: spawning is an explicit act.
 *
 * On a 54-card board the card body used to attach a terminal on any click — and one
 * of those died with "Terminal exited: 1" on the very first live look at the board.
 * A misclick should never start a process. Clicking now only selects; `open ↗` is
 * the button that spawns, and `steer` appears only where there is a pane to type
 * into.
 */
function addActions(
  parent: HTMLElement,
  card: ProjectCard,
  live: LiveSession | null,
  opts: {
    onOpen?: (c: ProjectCard) => void;
    onSteer?: (c: ProjectCard) => void;
    focused?: boolean;
  },
): void {
  const actions = parent.createDiv({ cls: "cockpit-card-actions" });
  if (opts.onOpen) {
    const open = actions.createEl("button", {
      cls: "cockpit-card-btn",
      text: "open ↗",
    });
    open.setAttr(
      "title",
      live || card.session
        ? "Attach a terminal to this session"
        : "Create the session and resume it",
    );
    open.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onOpen?.(card);
    });
  }
  // The steer button is offered ONLY for a session with a live pane, so the control
  // never appears where pressing it could not do anything.
  if (opts.onSteer && live?.injectable) {
    const btn = actions.createEl("button", {
      cls: "cockpit-card-btn cockpit-steer-btn",
      text: opts.focused ? "steering" : "steer",
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onSteer?.(card);
    });
  }
  if (!actions.hasChildNodes()) actions.remove();
}

/** A loose session with no project card -- rendered so it cannot be forgotten. */
export function renderUnclaimed(
  parent: HTMLElement,
  s: LiveSession,
): HTMLElement {
  const el = parent.createDiv({
    cls: `cockpit-card cockpit-card--${s.status} cockpit-card--loose`,
  });
  const head = el.createDiv({ cls: "cockpit-card-head" });
  head.createSpan({
    cls: "cockpit-card-title",
    text: s.slug || `(unclaimed) ${s.sid.slice(0, 8)}`,
  });
  const badge = head.createDiv({ cls: "cockpit-card-badge" });
  badge.createSpan({
    cls: `cockpit-dot cockpit-dot--${s.status}`,
    text: LIVE_DOT[s.status],
  });
  badge.createSpan({ cls: "cockpit-card-state", text: s.status });
  badge.createSpan({
    cls: `cockpit-host cockpit-host--${s.host_key ?? "mac"}`,
    text: s.host_key ?? "?",
  });
  badge.createSpan({ cls: "cockpit-card-ago", text: agoLabel(s.ago_s) });
  el.createDiv({ cls: "cockpit-card-status", text: s.title || "—" });
  return el;
}

/**
 * Is an engine-rendered `ago` string a day or more old?
 *
 * The session badge carries only the formatted string ("27s", "8d"), not an epoch,
 * so this reads the unit rather than re-deriving a timestamp the engine already
 * computed. Days and nothing else: an hours-old session is plausibly still yours.
 */
export function isStaleAgo(ago: string): boolean {
  return /^\d+d$/.test((ago ?? "").trim());
}

export function agoLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
