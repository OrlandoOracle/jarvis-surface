import { ItemView, Plugin, type WorkspaceLeaf } from "obsidian";
import { renderCard } from "./views/card";
import type { ProjectCard } from "./views/types";
import {
  DEFAULT_SETTINGS,
  migrateSettings,
  seedFromLegacy,
  type JarvisSettings,
} from "./state/settings";
import { RemoteClient } from "./remote/client";
import { JarvisSettingTab } from "./ui/settings-tab";

export const VIEW_TYPE_BOARD = "jarvis-board";

/**
 * The three legacy plugin ids whose flat `data.json` the cutover folds in. Order is
 * irrelevant (`seedFromLegacy` is key-presence based), but it is remote / board /
 * pocket so the tuple matches `seedFromLegacy(remote, board, pocket)` positionally.
 */
const LEGACY_PLUGIN_IDS = {
  remote: "obsidian-deborah-remote",
  board: "obsidian-session-modal",
  pocket: "pocketoracle",
} as const;

/**
 * The project/session board leaf — the first ported surface of the unified plugin.
 *
 * It owns the DOM and reuses the proven cockpit card renderer (`renderCard`). The
 * live feed, the daemon transport, and the spawn/steer wiring are deliberately NOT
 * ported in this unit (follow-on: session-modal feed + daemon + the local-rest-api
 * inbound routes). Until that lands the board renders whatever cards it has been
 * handed — an empty set on a fresh install — and says so, rather than faking data.
 */
export class JarvisBoardView extends ItemView {
  private cards: ProjectCard[] = [];

  constructor(leaf: WorkspaceLeaf) {
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

  /** Hand the board a fresh set of cards (the feed port will call this). */
  setCards(cards: ProjectCard[]): void {
    this.cards = cards;
    this.draw();
  }

  override async onOpen(): Promise<void> {
    this.draw();
  }

  private draw(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("jarvis-board");
    if (this.cards.length === 0) {
      root.createDiv({
        cls: "cockpit-empty",
        text: "No board feed yet — the session feed port is a follow-on unit.",
      });
      return;
    }
    for (const card of this.cards) renderCard(root, card);
  }
}

export default class JarvisSurfacePlugin extends Plugin {
  override settings: JarvisSettings = DEFAULT_SETTINGS;

  /** The tailnet remote-control channel (deborah-remote port). Null until gated on. */
  private remote: RemoteClient | null = null;

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

    this.registerView(VIEW_TYPE_BOARD, (leaf) => new JarvisBoardView(leaf));

    this.addRibbonIcon("layout-grid", "JARVIS board", () => {
      void this.openBoard();
    });
    this.addCommand({
      id: "open-board",
      name: "Open the JARVIS board",
      callback: () => void this.openBoard(),
    });

    this.addSettingTab(new JarvisSettingTab(this.app, this));

    // Remote-control channel: start it off the current settings. restartRemote applies
    // the enabled+configured gate itself, so a fresh install (no bearer) stays dark.
    this.restartRemote();
  }

  override onunload(): void {
    this.remote?.stop();
    this.remote = null;
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
      // Closest surface available until the stream-view port lands.
      openStream: () => this.openBoard(),
    });
    this.remote.start();
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
}
