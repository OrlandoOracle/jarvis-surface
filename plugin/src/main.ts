import { ItemView, Plugin, type WorkspaceLeaf } from "obsidian";
import { renderCard } from "./views/card";
import type { ProjectCard } from "./views/types";
import {
  DEFAULT_SETTINGS,
  migrateSettings,
  type JarvisSettings,
} from "./state/settings";

export const VIEW_TYPE_BOARD = "jarvis-board";

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

  override async onload(): Promise<void> {
    // Versioned + total migration: whatever is on disk (v1, a legacy flat shape, or
    // a truncated write) becomes a complete v1 object. If migration actually changed
    // the shape, persist it once so the file on disk stops being legacy.
    const raw = await this.loadData();
    this.settings = migrateSettings(raw);
    if (!raw || (raw as { schemaVersion?: unknown }).schemaVersion !== 1) {
      await this.saveData(this.settings);
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
  }

  /**
   * LiveSync replicates data.json across devices and will clobber it under a running
   * plugin. Obsidian calls this when the file changes on disk; re-migrate rather than
   * trust the in-memory copy, so a value another device wrote actually takes effect.
   */
  override async onExternalSettingsChange(): Promise<void> {
    this.settings = migrateSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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
