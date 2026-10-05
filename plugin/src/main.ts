import { ItemView, Plugin, requestUrl, type WorkspaceLeaf } from "obsidian";
import { renderCard } from "./views/card";
import { DashboardModal } from "./views/dashboard";
import { JarvisSessionsView, VIEW_TYPE_SESSIONS } from "./views/sessions";
import type { ProjectCard, ProjectsPayload } from "./views/types";
import {
  DEFAULT_SETTINGS,
  migrateSettings,
  seedFromLegacy,
  type JarvisSettings,
} from "./state/settings";
import { RemoteClient } from "./remote/client";
import { AskLoop } from "./ask/ask-loop";
import { JarvisSettingTab } from "./ui/settings-tab";

export const VIEW_TYPE_BOARD = "jarvis-board";

/**
 * Upper bound on how long an AskModal lingers before self-timing-out. The real TTL
 * is the broker's per-ask `exp`, which openModal clamps to — this is only the ceiling
 * for an ask whose exp is somehow further out. 2 min is generous for a tap.
 */
const ASK_MODAL_TTL_MS = 120_000;

/**
 * The three legacy plugin ids whose flat `data.json` the cutover folds in. Order is
 * irrelevant (`seedFromLegacy` is key-presence based), but it is remote / board /
 * pocket so the tuple matches `seedFromLegacy(remote, board, pocket)` positionally.
 *
 * These are the INSTALLED plugin ids (the `.obsidian/plugins/<id>/` folder names,
 * verified in the live vault), NOT the source-repo names — the repos are prefixed
 * `obsidian-*` but each manifest's `id` drops the prefix.
 */
const LEGACY_PLUGIN_IDS = {
  remote: "deborah-remote",
  board: "session-modal",
  pocket: "pocketoracle",
} as const;

const BOARD_REFRESH_MS = 30000;

/**
 * The project/session board leaf — the live feed surface of the unified plugin.
 *
 * It fetches the ranked `ProjectsPayload` from the Mini sessions-daemon
 * (`board.daemonUrl` + `/projects`) over `requestUrl` — the same mobile-safe transport
 * the remote channel uses, so the board works on the iPad/phone, not just desktop. The
 * payload is pre-ranked by the engine (live first, then by `updated`); the renderer
 * never re-sorts it. Cards reuse the proven cockpit `renderCard`. Tapping a card opens
 * that project's CONTINUE.md. Spawn/steer/terminal controls stay a follow-on unit; this
 * unit is the read + render feed.
 */
export class JarvisBoardView extends ItemView {
  private cards: ProjectCard[] = [];
  private status: "loading" | "ok" | "error" = "loading";
  private errorMsg = "";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: JarvisSurfacePlugin,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return VIEW_TYPE_BOARD;
  }

  override getDisplayText(): string {
    return "JARVIS board";
  }

  override getIcon(): string {
    return "layout-grid";
  }

  override async onOpen(): Promise<void> {
    this.draw();
    await this.refresh();
    // Auto-refresh while the leaf is open; registerInterval clears it on close.
    this.registerInterval(
      window.setInterval(() => void this.refresh(), BOARD_REFRESH_MS),
    );
  }

  /** Pull the ranked project feed from the daemon and redraw. */
  private async refresh(): Promise<void> {
    const base = this.plugin.settings.board.daemonUrl.replace(/\/+$/, "");
    if (!base) {
      this.status = "error";
      this.errorMsg = "No daemon URL set (Settings → JARVIS Surface → Board).";
      this.draw();
      return;
    }
    const url = base + "/projects";
    try {
      const r = await requestUrl({ url, method: "GET", throw: false });
      if (r.status !== 200) {
        this.status = "error";
        this.errorMsg = `Daemon returned ${r.status} at ${url}`;
        this.draw();
        return;
      }
      const payload = (r.json ?? JSON.parse(r.text)) as ProjectsPayload;
      this.cards = Array.isArray(payload.projects) ? payload.projects : [];
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
    root.addClass("jarvis-board");

    // Header: count + a manual refresh button.
    const head = root.createDiv({ cls: "jarvis-board-head" });
    const title =
      this.status === "ok"
        ? `${this.cards.length} project${this.cards.length === 1 ? "" : "s"}`
        : this.status === "loading"
          ? "Loading…"
          : "Board";
    head.createSpan({ cls: "jarvis-board-title", text: title });
    const btn = head.createEl("button", {
      cls: "jarvis-board-refresh",
      text: "↻",
      attr: { "aria-label": "Refresh" },
    });
    btn.addEventListener("click", () => void this.refresh());

    if (this.status === "loading") {
      root.createDiv({ cls: "cockpit-empty", text: "Loading the project feed…" });
      return;
    }
    if (this.status === "error") {
      root.createDiv({ cls: "cockpit-empty", text: this.errorMsg });
      return;
    }
    if (this.cards.length === 0) {
      root.createDiv({ cls: "cockpit-empty", text: "No projects on the board." });
      return;
    }
    // Ranked by the engine (live first, then updated) — render in order, never re-sort.
    for (const card of this.cards) {
      renderCard(root, card, {
        // Tapping a card opens the project DASHBOARD modal (the /ask ruling 2026-10-05),
        // NOT the raw CONTINUE.md — the note is now a secondary button inside the modal.
        onPick: (c) => {
          new DashboardModal(
            { app: this.plugin.app, getSettings: () => this.plugin.settings },
            c,
          ).open();
        },
      });
    }
  }
}

export default class JarvisSurfacePlugin extends Plugin {
  override settings: JarvisSettings = DEFAULT_SETTINGS;

  /** The tailnet remote-control channel (deborah-remote port). Null until gated on. */
  private remote: RemoteClient | null = null;

  /** The tap-don't-type ask-loop poller (pocketoracle port). Null until gated on. */
  private ask: AskLoop | null = null;

  override async onload(): Promise<void> {
    // Versioned + total migration: whatever is on disk (v1, a legacy flat shape, or
    // a truncated write) becomes a complete v1 object. If migration actually changed
    // the shape, persist it once so the file on disk stops being legacy.
    const raw = await this.loadData();
    const firstRun = !raw || (raw as { schemaVersion?: unknown }).schemaVersion !== 1;
    if (firstRun) {
      // First-run cutover: the three legacy plugins each shipped their OWN flat
      // data.json. If any are still on disk, seed from all three at once (richer than
      // migrateSettings, which only sees this plugin's single file). Fall back to the
      // single-file migration when no legacy data is found (genuine fresh install, or
      // a partial/garbage write). Either way we persist once so the file stops being
      // legacy and the next load is a clean v1.
      const legacy = await this.loadLegacyData();
      this.settings = legacy
        ? seedFromLegacy(legacy.remote, legacy.board, legacy.pocket)
        : migrateSettings(raw);
      await this.saveData(this.settings);
    } else {
      this.settings = migrateSettings(raw);
    }

    this.registerView(VIEW_TYPE_BOARD, (leaf) => new JarvisBoardView(leaf, this));
    this.registerView(
      VIEW_TYPE_SESSIONS,
      (leaf) =>
        new JarvisSessionsView(leaf, {
          app: this.app,
          getSettings: () => this.settings,
        }),
    );

    this.addRibbonIcon("layout-grid", "JARVIS board", () => {
      void this.openBoard();
    });
    this.addRibbonIcon("terminal", "JARVIS sessions", () => {
      void this.openSessions();
    });
    this.addCommand({
      id: "open-board",
      name: "Open the JARVIS board",
      callback: () => void this.openBoard(),
    });
    this.addCommand({
      id: "open-sessions",
      name: "Open the JARVIS session feed",
      callback: () => void this.openSessions(),
    });

    this.addSettingTab(new JarvisSettingTab(this.app, this));

    // Remote-control channel: start it off the current settings. restartRemote applies
    // the enabled+configured gate itself, so a fresh install (no bearer) stays dark.
    this.restartRemote();
    // Ask-loop poller: same pattern — restartAsk gates on askLoop + brokerUrl, so a
    // fresh install (no broker URL) stays dark.
    this.restartAsk();
  }

  override onunload(): void {
    this.remote?.stop();
    this.remote = null;
    this.ask?.stop();
    this.ask = null;
  }

  /**
   * (Re)open the command-channel client from the LIVE settings. Called on load and
   * whenever the settings tab changes a `remote.*` value — the socket snapshots
   * baseUrl/bearer/remoteControl at connect time, so a changed bearer only takes
   * effect once the old client is torn down and a new one connects. Starts a client
   * ONLY when remote control is on AND both baseUrl and bearer are set; otherwise it
   * leaves the channel dark (the client guards too, but not spinning one up is cleaner).
   */
  restartRemote(): void {
    this.remote?.stop();
    this.remote = null;
    const r = this.settings.remote;
    if (!(r.remoteControl && r.baseUrl && r.bearer)) return;
    this.remote = new RemoteClient({
      app: this.app,
      plugin: this,
      getSettings: () => this.settings.remote,
      // The `openstream` remote op surfaces the live session feed.
      openStream: () => this.openSessions(),
    });
    this.remote.start();
  }

  /**
   * (Re)start the ask-loop poller from the LIVE settings. Called on load and whenever
   * the settings tab changes an `ask.*` value. Starts a loop ONLY when the ask-loop is
   * enabled AND a broker URL is set; otherwise it tears the loop down and leaves it
   * dark. Mirrors restartRemote so a changed brokerUrl/cadence takes effect by
   * teardown-and-recreate rather than mutating a running poller.
   */
  restartAsk(): void {
    this.ask?.stop();
    this.ask = null;
    const a = this.settings.ask;
    if (!(a.askLoop && a.brokerUrl)) return;
    this.ask = new AskLoop(this.app, a.brokerUrl, {
      ttlMs: ASK_MODAL_TTL_MS,
      pollMs: a.askPollMs,
    });
    this.ask.start();
  }

  /**
   * LiveSync replicates data.json across devices and will clobber it under a running
   * plugin. Obsidian calls this when the file changes on disk; re-migrate rather than
   * trust the in-memory copy, so a value another device wrote actually takes effect.
   */
  override async onExternalSettingsChange(): Promise<void> {
    this.settings = migrateSettings(await this.loadData());
    // A device wrote new remote config (e.g. a bearer). The open socket snapshotted the
    // old values, so reconnect off the merged settings rather than trust the live copy.
    this.restartRemote();
    // Same for the ask-loop: a device may have written a brokerUrl or toggled askLoop.
    this.restartAsk();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Read the three legacy plugins' `data.json` straight off the vault adapter (they
   * live at `<configDir>/plugins/<id>/data.json`). Returns the parsed bags, or null
   * if NONE of the three exist — so the caller can tell a real cutover from a fresh
   * install. A present-but-unparseable file reads as null for that slot;
   * `seedFromLegacy` treats a null slot as "take defaults".
   */
  private async loadLegacyData(): Promise<
    { remote: unknown; board: unknown; pocket: unknown } | null
  > {
    const read = async (id: string): Promise<unknown> => {
      const p = `${this.app.vault.configDir}/plugins/${id}/data.json`;
      try {
        if (!(await this.app.vault.adapter.exists(p))) return null;
        return JSON.parse(await this.app.vault.adapter.read(p));
      } catch {
        return null;
      }
    };
    const [remote, board, pocket] = await Promise.all([
      read(LEGACY_PLUGIN_IDS.remote),
      read(LEGACY_PLUGIN_IDS.board),
      read(LEGACY_PLUGIN_IDS.pocket),
    ]);
    if (remote == null && board == null && pocket == null) return null;
    return { remote, board, pocket };
  }

  async openBoard(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_BOARD);
    if (existing.length) {
      await this.app.workspace.revealLeaf(existing[0]!);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_BOARD, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async openSessions(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_SESSIONS);
    if (existing.length) {
      await this.app.workspace.revealLeaf(existing[0]!);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_SESSIONS, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}
