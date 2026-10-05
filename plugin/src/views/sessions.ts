import { ItemView, requestUrl, type App, type WorkspaceLeaf } from "obsidian";
import type { JarvisSettings } from "../state/settings";
import type { SessionRow, SessionsPayload } from "./types";

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

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: SessionsHost,
  ) {
    super(leaf);
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
    for (const s of this.rows) renderSessionRow(root, s);
  }
}

/**
 * Render one session as a compact row. Reuses the cockpit `session-card` classes so
 * it inherits the board's look. A running session gets a filled active dot; a pinned
 * desk that is not up gets a cold dot (`running: false`). The subtitle is the engine's
 * `note` (pane title, else CONTINUE.md status) — rendered, never parsed.
 */
export function renderSessionRow(root: HTMLElement, s: SessionRow): void {
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
}
