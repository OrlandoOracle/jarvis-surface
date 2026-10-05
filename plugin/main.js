"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  JarvisBoardView: () => JarvisBoardView,
  VIEW_TYPE_BOARD: () => VIEW_TYPE_BOARD,
  default: () => JarvisSurfacePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/views/types.ts
var LIVE_DOT = {
  "needs-you": "\u25CF",
  // Filled, like needs-you, because it IS blocked — ringed, because it is held.
  attending: "\u25C9",
  stalled: "\u25B2",
  active: "\u25CF",
  idle: "\u25CB",
  remote: "\u25C7",
  ended: "\xD7"
};

// src/views/card.ts
function renderCard(parent, card, opts = {}) {
  const el = parent.createDiv({ cls: "cockpit-card" });
  const live = card.live ?? null;
  if (live) el.addClass(`cockpit-card--${live.status}`);
  else if (card.session) el.addClass("cockpit-card--unknown");
  else el.addClass("cockpit-card--cold");
  if (opts.greyed) el.addClass("cockpit-card--greyed");
  if (opts.compact) el.addClass("cockpit-card--compact");
  const head = el.createDiv({ cls: "cockpit-card-head" });
  head.createSpan({ cls: "cockpit-card-title", text: card.slug });
  const badge = head.createDiv({ cls: "cockpit-card-badge" });
  if (live) {
    badge.createSpan({
      cls: `cockpit-dot cockpit-dot--${live.status}`,
      text: LIVE_DOT[live.status]
    });
    badge.createSpan({ cls: "cockpit-card-state", text: live.status });
    badge.createSpan({
      cls: `cockpit-host cockpit-host--${live.host_key ?? "mac"}`,
      text: live.host_key ?? "?"
    });
    badge.createSpan({ cls: "cockpit-card-ago", text: agoLabel(live.ago_s) });
    if (!live.injectable) {
      badge.createSpan({
        cls: "cockpit-tag cockpit-tag--monitor",
        text: "monitor-only"
      });
    }
    if (live.source === "capture") {
      badge.createSpan({
        cls: "cockpit-tag cockpit-tag--capture",
        text: "via pane"
      });
    }
  } else if (card.session) {
    badge.createSpan({ cls: "cockpit-dot cockpit-dot--unknown", text: "\u25CD" });
    badge.createSpan({ cls: "cockpit-card-state", text: "up, no beacon" });
    badge.createSpan({
      cls: `cockpit-host cockpit-host--${card.session.host}`,
      text: card.session.host
    });
    badge.createSpan({ cls: "cockpit-card-ago", text: card.session.ago });
    if (isStaleAgo(card.session.ago)) {
      badge.createSpan({
        cls: "cockpit-tag cockpit-tag--stale",
        text: `\u26A0 stale ${card.session.ago}`
      });
    }
  } else {
    badge.createSpan({ cls: "cockpit-dot cockpit-dot--cold", text: "\u25CB" });
    badge.createSpan({ cls: "cockpit-card-ago", text: card.updated || "\u2014" });
    badge.createSpan({
      cls: `cockpit-host cockpit-host--${card.create_on}`,
      text: card.create_on
    });
  }
  if (opts.compact) {
    if (opts.focused) el.addClass("cockpit-card--focused");
    if (opts.onPick) {
      el.addClass("cockpit-card--clickable");
      el.addEventListener("click", () => opts.onPick?.(card));
    }
    addActions(head, card, live, opts);
    return el;
  }
  el.createDiv({ cls: "cockpit-card-status", text: card.status || "\u2014" });
  el.createDiv({ cls: "cockpit-card-next" }).createSpan({
    cls: card.next ? "cockpit-next-text" : "cockpit-next-text cockpit-next-text--none",
    text: card.next ? `NEXT \u2192 ${card.next}` : "NEXT \u2192 \u2014"
  });
  if (opts.focused) el.addClass("cockpit-card--focused");
  if (opts.onPick) {
    el.addClass("cockpit-card--clickable");
    el.addEventListener("click", () => opts.onPick?.(card));
  }
  addActions(el, card, live, opts);
  return el;
}
function addActions(parent, card, live, opts) {
  const actions = parent.createDiv({ cls: "cockpit-card-actions" });
  if (opts.onOpen) {
    const open = actions.createEl("button", {
      cls: "cockpit-card-btn",
      text: "open \u2197"
    });
    open.setAttr(
      "title",
      live || card.session ? "Attach a terminal to this session" : "Create the session and resume it"
    );
    open.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onOpen?.(card);
    });
  }
  if (opts.onSteer && live?.injectable) {
    const btn = actions.createEl("button", {
      cls: "cockpit-card-btn cockpit-steer-btn",
      text: opts.focused ? "steering" : "steer"
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onSteer?.(card);
    });
  }
  if (!actions.hasChildNodes()) actions.remove();
}
function isStaleAgo(ago) {
  return /^\d+d$/.test((ago ?? "").trim());
}
function agoLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "\u2014";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// src/state/settings.ts
var SCHEMA_VERSION = 1;
var DEFAULT_SETTINGS = {
  schemaVersion: SCHEMA_VERSION,
  remote: {
    // Verified from obsidian-deborah-remote/main.js DEFAULTS.
    baseUrl: "https://deborah-2.tail1fd1c8.ts.net/todaystream",
    bearer: "",
    remoteControl: true,
    allowEval: false
  },
  board: {
    // Verified from obsidian-session-modal/src/settings.ts DEFAULT_SETTINGS.
    forceWebTerm: false,
    daemonUrl: "http://100.122.18.7:8091",
    localFallback: true,
    steerToken: "",
    forceDaemonSteer: false
  },
  ask: {
    askLoop: true,
    brokerUrl: "",
    askPollMs: 2e3
  },
  term: {
    wsUrl: "",
    sessionLabel: "jarvis",
    authToken: "",
    // DOM, not canvas: the broken-GPU boxes in the mesh blank the pane under webgl.
    useCanvasRenderer: false,
    fontSize: 14,
    lineHeight: 1.2,
    showKeyBar: true,
    copyOnSelect: true
  }
};
function isObj(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v, fallback) {
  return typeof v === "string" ? v : fallback;
}
function bool(v, fallback) {
  return typeof v === "boolean" ? v : fallback;
}
function num(v, fallback) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function foldRemote(src, into) {
  into.baseUrl = str(src.baseUrl, into.baseUrl);
  into.bearer = str(src.bearer, into.bearer);
  into.remoteControl = bool(src.remoteControl, into.remoteControl);
  into.allowEval = bool(src.allowEval, into.allowEval);
}
function foldBoard(src, into) {
  into.forceWebTerm = bool(src.forceWebTerm, into.forceWebTerm);
  into.daemonUrl = str(src.daemonUrl, into.daemonUrl);
  into.localFallback = bool(src.localFallback, into.localFallback);
  into.steerToken = str(src.steerToken, into.steerToken);
  into.forceDaemonSteer = bool(src.forceDaemonSteer, into.forceDaemonSteer);
}
function foldPocket(src, ask, term) {
  ask.askLoop = bool(src.askLoop, ask.askLoop);
  ask.brokerUrl = str(src.brokerUrl, ask.brokerUrl);
  ask.askPollMs = num(src.askPollMs, ask.askPollMs);
  term.wsUrl = str(src.wsUrl, term.wsUrl);
  term.sessionLabel = str(src.sessionLabel, term.sessionLabel);
  term.authToken = str(src.authToken, term.authToken);
  term.useCanvasRenderer = bool(src.useCanvasRenderer, term.useCanvasRenderer);
  term.fontSize = num(src.fontSize, term.fontSize);
  term.lineHeight = num(src.lineHeight, term.lineHeight);
  term.showKeyBar = bool(src.showKeyBar, term.showKeyBar);
  term.copyOnSelect = bool(src.copyOnSelect, term.copyOnSelect);
}
function freshDefaults() {
  const d = DEFAULT_SETTINGS;
  return {
    schemaVersion: SCHEMA_VERSION,
    remote: { ...d.remote },
    board: { ...d.board },
    ask: { ...d.ask },
    term: { ...d.term }
  };
}
function migrateSettings(raw) {
  const out = freshDefaults();
  if (!isObj(raw)) return out;
  if (raw.schemaVersion === SCHEMA_VERSION) {
    if (isObj(raw.remote)) foldRemote(raw.remote, out.remote);
    if (isObj(raw.board)) foldBoard(raw.board, out.board);
    if (isObj(raw.ask)) foldPocket(raw.ask, out.ask, out.term);
    if (isObj(raw.term)) foldPocket(raw.term, out.ask, out.term);
    return out;
  }
  foldRemote(raw, out.remote);
  foldBoard(raw, out.board);
  foldPocket(raw, out.ask, out.term);
  return out;
}

// src/main.ts
var VIEW_TYPE_BOARD = "jarvis-board";
var JarvisBoardView = class extends import_obsidian.ItemView {
  cards = [];
  constructor(leaf) {
    super(leaf);
  }
  getViewType() {
    return VIEW_TYPE_BOARD;
  }
  getDisplayText() {
    return "JARVIS board";
  }
  getIcon() {
    return "layout-grid";
  }
  /** Hand the board a fresh set of cards (the feed port will call this). */
  setCards(cards) {
    this.cards = cards;
    this.draw();
  }
  async onOpen() {
    this.draw();
  }
  draw() {
    const root = this.contentEl;
    root.empty();
    root.addClass("jarvis-board");
    if (this.cards.length === 0) {
      root.createDiv({
        cls: "cockpit-empty",
        text: "No board feed yet \u2014 the session feed port is a follow-on unit."
      });
      return;
    }
    for (const card of this.cards) renderCard(root, card);
  }
};
var JarvisSurfacePlugin = class extends import_obsidian.Plugin {
  settings = DEFAULT_SETTINGS;
  async onload() {
    const raw = await this.loadData();
    this.settings = migrateSettings(raw);
    if (!raw || raw.schemaVersion !== 1) {
      await this.saveData(this.settings);
    }
    this.registerView(VIEW_TYPE_BOARD, (leaf) => new JarvisBoardView(leaf));
    this.addRibbonIcon("layout-grid", "JARVIS board", () => {
      void this.openBoard();
    });
    this.addCommand({
      id: "open-board",
      name: "Open the JARVIS board",
      callback: () => void this.openBoard()
    });
  }
  /**
   * LiveSync replicates data.json across devices and will clobber it under a running
   * plugin. Obsidian calls this when the file changes on disk; re-migrate rather than
   * trust the in-memory copy, so a value another device wrote actually takes effect.
   */
  async onExternalSettingsChange() {
    this.settings = migrateSettings(await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async openBoard() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_BOARD);
    if (existing.length) {
      await this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_BOARD, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
};
