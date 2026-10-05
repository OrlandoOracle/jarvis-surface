import { ItemView, requestUrl, type App, type WorkspaceLeaf } from "obsidian";
import type { JarvisSettings } from "../state/settings";
import type { SessionRow, SessionsPayload } from "./types";
import { SteerClient } from "./steer";

/** How often an EXPANDED transcript tail re-fetches. Faster than the feed itself. */
const TAIL_REFRESH_MS = 5000;
/** Lines of pane history a tail pulls — a "what's it doing" peek, not the whole buffer. */
const TAIL_LINES = 200;

/** Stable key for a session row (host + name) — identifies an expanded tail across redraws. */
function rowKey(s: SessionRow): string {
  return `${s.host}:${s.name}`;
}

export const VIEW_TYPE_SESSIONS = "jarvis-sessions";

/** Poll cadence for the live session feed. Matches the board leaf. */
const SESSIONS_REFRESH_MS = 30000;

/** The host context the leaf needs — kept to an interface so tests can stub it. */
export interface SessionsHost {
  app: App;
  getSettings: () => JarvisSettings;
}

/**
 * The live-session feed leaf — the "what Claude sessions are alive right now, and
 * what are they doing" surface. Distinct from the project board (`JarvisBoardView`,
 * `/projects`): that ranks PROJECT dossiers, this lists RUNNING tmux sessions as the
 * daemon's `/sessions` engine reports them (name, host, attached, activity, pane
 * title). Read + render only — steering a project is the dashboard modal's job; this
 * is the monitor.
 *
 * Transport is the same mobile-safe path everything else uses: `requestUrl` to
 * `board.daemonUrl` + `/sessions`, which the keystone already proxies over HTTPS
 * (daemon is plain-HTTP on :8091 and iOS ATS blocks cleartext). The payload is served
 * in the engine's order; the renderer never re-sorts it.
 */
export class JarvisSessionsView extends ItemView {
  private rows: SessionRow[] = [];
  private status: "loading" | "ok" | "error" = "loading";
  private errorMsg = "";
  /** Row keys whose transcript tail is currently expanded. Survives feed redraws. */
  private readonly expanded = new Set<string>();
  /** Per-expanded-row tail poll timers, so a redraw can clear stale ones cleanly. */
  private readonly tailTimers = new Map<string, number>();

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: SessionsHost,
  ) {
    super(leaf);
  }

  /** Steer client built from live settings — same keystone front + cmd bearer the
   *  dashboard uses. `/pane` (transcript tail) is a read behind that same bearer. */
  private buildSteer(): SteerClient {
    const s = this.host.getSettings();
    return new SteerClient(s.board.daemonUrl, s.remote.bearer);
  }

  /** Clear every open tail poll — called before a redraw (whose DOM the timers point
   *  into) and on view close. */
  private clearTailTimers(): void {
    for (const id of this.tailTimers.values()) window.clearInterval(id);
    this.tailTimers.clear();
  }

  override async onClose(): Promise<void> {
    this.clearTailTimers();
  }

  override getViewType(): string {
    return VIEW_TYPE_SESSIONS;
  }

  override getDisplayText(): string {
    return "JARVIS sessions";
  }

  override getIcon(): string {
    return "terminal";
  }

  override async onOpen(): Promise<void> {
    this.draw();
    await this.refresh();
    this.registerInterval(
      window.setInterval(() => void this.refresh(), SESSIONS_REFRESH_MS),
    );
  }

  /** Pull the live session feed from the daemon (via the keystone proxy) and redraw. */
  private async refresh(): Promise<void> {
    const base = this.host.getSettings().board.daemonUrl.replace(/\/+$/, "");
    if (!base) {
      this.status = "error";
      this.errorMsg = "No daemon URL set (Settings → JARVIS Surface → Board).";
      this.draw();
      return;
    }
    const url = base + "/sessions";
    try {
      const r = await requestUrl({ url, method: "GET", throw: false });
      if (r.status !== 200) {
        this.status = "error";
        this.errorMsg = `Daemon returned ${r.status} at ${url}`;
        this.draw();
        return;
      }
      const payload = (r.json ?? JSON.parse(r.text)) as SessionsPayload;
      this.rows = Array.isArray(payload.sessions) ? payload.sessions : [];
      this.status = "ok";
      this.draw();
    } catch {
      this.status = "error";
      this.errorMsg = `Daemon unreachable at ${url} — is Tailscale on?`;
      this.draw();
    }
  }

  private draw(): void {
    // Timers point into the DOM we are about to blow away — clear before emptying.
    this.clearTailTimers();
    const root = this.contentEl;
    root.empty();
    root.addClass("jarvis-sessions");

    const liveCount = this.rows.filter((s) => s.running).length;
    const head = root.createDiv({ cls: "jarvis-board-head" });
    const title =
      this.status === "ok"
        ? `${liveCount} live · ${this.rows.length} session${this.rows.length === 1 ? "" : "s"}`
        : this.status === "loading"
          ? "Loading…"
          : "Sessions";
    head.createSpan({ cls: "jarvis-board-title", text: title });
    const btn = head.createEl("button", {
      cls: "jarvis-board-refresh",
      text: "↻",
      attr: { "aria-label": "Refresh" },
    });
    btn.addEventListener("click", () => void this.refresh());

    if (this.status === "loading") {
      root.createDiv({ cls: "cockpit-empty", text: "Loading the session feed…" });
      return;
    }
    if (this.status === "error") {
      root.createDiv({ cls: "cockpit-empty", text: this.errorMsg });
      return;
    }
    if (this.rows.length === 0) {
      root.createDiv({ cls: "cockpit-empty", text: "No sessions reported." });
      return;
    }
    // Engine order is authoritative (running/pinned first) — render as handed.
    for (const s of this.rows) this.drawRow(root, s);
  }

  /** One session row + (when running) a tappable transcript-tail panel. */
  private drawRow(root: HTMLElement, s: SessionRow): void {
    const card = renderSessionRow(root, s);
    // Only a running session has a live pane worth tailing; a cold desk has nothing.
    if (!s.running) return;
    const key = rowKey(s);

    const toggle = card.createEl("button", {
      cls: "jarvis-tail-toggle",
      text: this.expanded.has(key) ? "▾ hide output" : "▸ show output",
    });
    toggle.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (this.expanded.has(key)) this.expanded.delete(key);
      else this.expanded.add(key);
      this.draw();
    });

    if (!this.expanded.has(key)) return;

    const pre = card.createEl("pre", { cls: "jarvis-tail", text: "loading output…" });
    // Fetch now, then poll while expanded. The timer is tracked so the next redraw
    // (feed refresh) clears it before this DOM node is discarded.
    void this.updateTail(pre, s);
    const id = window.setInterval(() => void this.updateTail(pre, s), TAIL_REFRESH_MS);
    this.tailTimers.set(key, id);
  }

  /** Fetch the pane tail and write it into `pre`, keeping the view scrolled to newest. */
  private async updateTail(pre: HTMLElement, s: SessionRow): Promise<void> {
    const steer = this.buildSteer();
    if (!steer.configured) {
      pre.setText("Set the device bearer (Settings → JARVIS Surface → Remote) to read output.");
      return;
    }
    const r = await steer.tail(s.host, s.name, TAIL_LINES);
    if (r.kind === "error") {
      pre.setText(`output unavailable: ${r.error}`);
      return;
    }
    // Trailing blank lines are just tmux padding the pane height — trim them so the
    // newest real line sits at the bottom of the box.
    pre.setText(r.text.replace(/\s+$/, "") || "(pane is empty)");
    pre.scrollTop = pre.scrollHeight;
  }
}

/**
 * Render one session as a compact row. Reuses the cockpit `session-card` classes so
 * it inherits the board's look. A running session gets a filled active dot; a pinned
 * desk that is not up gets a cold dot (`running: false`). The subtitle is the engine's
 * `note` (pane title, else CONTINUE.md status) — rendered, never parsed.
 */
export function renderSessionRow(root: HTMLElement, s: SessionRow): HTMLElement {
  const card = root.createDiv({
    cls: `session-card ${s.running ? "" : "session-card--cold"}`.trim(),
  });

  const headEl = card.createDiv({ cls: "session-card-head" });
  headEl.createSpan({
    cls: `session-card-dot cockpit-dot--${s.running ? "active" : "cold"}`,
    text: s.running ? "●" : "○",
  });
  headEl.createSpan({ cls: "session-card-title", text: s.name });
  headEl.createSpan({
    cls: `session-card-host session-card-host--${s.host === "mac" ? "mac" : "d"}`,
    text: s.host,
  });
  if (s.attached) headEl.createSpan({ cls: "session-card-tag", text: "attached" });

  const meta = card.createDiv({ cls: "session-board-meta" });
  meta.createSpan({ text: s.running ? `${s.windows}w · ${s.ago}` : "not running" });

  const note = (s.note || s.pane_title || "").trim();
  if (note) card.createDiv({ cls: "session-card-pane", text: note });
  return card;
}
