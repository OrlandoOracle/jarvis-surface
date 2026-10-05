"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  JarvisBoardView: () => JarvisBoardView,
  VIEW_TYPE_BOARD: () => VIEW_TYPE_BOARD,
  default: () => JarvisSurfacePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

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

// src/remote/client.ts
var import_obsidian2 = require("obsidian");

// src/remote/dispatcher.ts
var obsidian = __toESM(require("obsidian"), 1);
var import_obsidian = require("obsidian");
var ALLOWED_OPS = [
  "hello",
  "notice",
  "open",
  "openstream",
  "mode",
  "command",
  "create",
  "modify",
  "append",
  "delete"
];
var RemoteDispatcher = class {
  constructor(deps) {
    this.deps = deps;
  }
  fileByPath(path) {
    const af = this.deps.app.vault.getAbstractFileByPath(path);
    return af instanceof import_obsidian.TFile ? af : null;
  }
  // Flip the active markdown view between Reading (preview) and Source. Anything
  // that is not "reading"/"preview" means Source, exactly as the original.
  async setMode(mode) {
    const view = this.deps.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!view) return;
    const state = view.getState();
    state.mode = mode === "reading" || mode === "preview" ? "preview" : "source";
    await view.setState(state, { history: false });
  }
  async execute(cmd) {
    if (!cmd || cmd.op === "hello") return;
    const { app, ack } = this.deps;
    if (cmd.op === "eval" && !this.deps.allowEval()) {
      await ack(cmd.id, false, "refused: eval is fenced (Settings -> JARVIS surface -> Allow eval)");
      new import_obsidian.Notice("JARVIS remote: refused a pushed eval (fenced)");
      return;
    }
    if (cmd.op !== "eval" && !ALLOWED_OPS.includes(cmd.op)) {
      await ack(cmd.id, false, "refused: op not in allow-list");
      return;
    }
    try {
      switch (cmd.op) {
        case "notice":
          new import_obsidian.Notice(String(cmd.msg ?? ""));
          break;
        case "open":
          await app.workspace.openLinkText(cmd.path ?? "", "", !!cmd.newLeaf);
          if (cmd.mode) await this.setMode(cmd.mode);
          break;
        case "openstream":
          if (this.deps.openStream) await this.deps.openStream();
          else new import_obsidian.Notice("JARVIS remote: stream view is not ported in this build");
          break;
        case "mode":
          await this.setMode(cmd.mode);
          break;
        case "command": {
          const cid = cmd.command_id;
          if (!cid) throw new Error("command needs command_id");
          const reg = app.commands;
          if (!reg.executeCommandById(cid)) throw new Error("no such command: " + cid);
          break;
        }
        case "create": {
          const ex = this.fileByPath(cmd.path ?? "");
          if (ex) await app.vault.modify(ex, cmd.content ?? "");
          else await app.vault.create(cmd.path ?? "", cmd.content ?? "");
          break;
        }
        case "modify": {
          const f = this.fileByPath(cmd.path ?? "");
          if (!f) throw new Error("no such file: " + cmd.path);
          await app.vault.modify(f, cmd.content ?? "");
          break;
        }
        case "append": {
          let f = this.fileByPath(cmd.path ?? "");
          if (!f) f = await app.vault.create(cmd.path ?? "", "");
          await app.vault.append(f, cmd.text ?? "");
          break;
        }
        case "delete": {
          const f = this.fileByPath(cmd.path ?? "");
          if (f) await app.vault.trash(f, true);
          break;
        }
        case "eval": {
          const fn = new Function(
            "app",
            "plugin",
            "obsidian",
            '"use strict";return (async()=>{' + (cmd.js ?? "") + "})()"
          );
          const out = await fn(app, this.deps.plugin, obsidian);
          await ack(cmd.id, true, out);
          return;
        }
        default:
          throw new Error("unknown op: " + cmd.op);
      }
      await ack(cmd.id, true, "ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ack(cmd.id, false, msg);
      new import_obsidian.Notice("JARVIS remote: " + msg);
    }
  }
};

// src/remote/client.ts
function trimBase(u) {
  return (u || "").replace(/\/+$/, "");
}
function genClientId() {
  const P = import_obsidian2.Platform;
  const kind = P.isIosApp ? "ios" : P.isAndroidApp ? "android" : P.isMacOS ? "mac" : P.isWin ? "win" : P.isLinux ? "linux" : P.isMobile ? "mobile" : "desktop";
  let rand = "";
  try {
    const b = new Uint8Array(2);
    crypto.getRandomValues(b);
    rand = Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
  } catch {
    rand = Math.floor(Math.random() * 65536).toString(16).padStart(4, "0");
  }
  return kind + "-" + rand;
}
var RETRY_MS = 4e3;
var RemoteClient = class {
  constructor(deps) {
    this.deps = deps;
    this.clientId = genClientId();
    this.dispatcher = new RemoteDispatcher({
      app: deps.app,
      plugin: deps.plugin,
      allowEval: () => deps.getSettings().allowEval,
      ack: (id, ok, result) => this.ack(id, ok, result),
      openStream: deps.openStream
    });
  }
  es = null;
  retry = null;
  stopped = true;
  clientId;
  dispatcher;
  start() {
    this.stopped = false;
    this.connect();
  }
  stop() {
    this.stopped = true;
    this.disconnect();
  }
  connect() {
    this.disconnect();
    if (this.stopped) return;
    const s = this.deps.getSettings();
    const base = trimBase(s.baseUrl);
    const bearer = s.bearer;
    if (!base || !bearer) return;
    const url = base + "/cmd/stream?bearer=" + encodeURIComponent(bearer) + "&client=" + encodeURIComponent(this.clientId);
    try {
      this.es = new EventSource(url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.es.onmessage = (e) => {
      let cmd;
      try {
        cmd = JSON.parse(e.data);
      } catch {
        return;
      }
      void this.dispatcher.execute(cmd);
    };
    this.es.onerror = () => {
    };
  }
  disconnect() {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    if (this.retry) {
      clearTimeout(this.retry);
      this.retry = null;
    }
  }
  scheduleRetry() {
    if (this.retry || this.stopped) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, RETRY_MS);
  }
  /** POST a pushed op's result back to `/cmd/ack`. Best-effort: a failed ack is ignored. */
  async ack(id, ok, result) {
    if (id == null) return;
    const s = this.deps.getSettings();
    const base = trimBase(s.baseUrl);
    if (!base || !s.bearer) return;
    try {
      await (0, import_obsidian2.requestUrl)({
        url: base + "/cmd/ack?bearer=" + encodeURIComponent(s.bearer),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          ok,
          client: this.clientId,
          result: result == null ? null : String(result).slice(0, 500)
        }),
        throw: false
      });
    } catch {
    }
  }
};

// src/main.ts
var VIEW_TYPE_BOARD = "jarvis-board";
var JarvisBoardView = class extends import_obsidian3.ItemView {
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
var JarvisSurfacePlugin = class extends import_obsidian3.Plugin {
  settings = DEFAULT_SETTINGS;
  /** The tailnet remote-control channel (deborah-remote port). Null until gated on. */
  remote = null;
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
    const r = this.settings.remote;
    if (r.remoteControl && r.baseUrl && r.bearer) {
      this.remote = new RemoteClient({
        app: this.app,
        plugin: this,
        getSettings: () => this.settings.remote,
        // Closest surface available until the stream-view port lands.
        openStream: () => this.openBoard()
      });
      this.remote.start();
    }
  }
  onunload() {
    this.remote?.stop();
    this.remote = null;
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
