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
var import_obsidian4 = require("obsidian");

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
    // Re-pointed off the dead d2 `todaystream` to the Mini keystone `/jarvis` inbound
    // (d2 left the mesh 2026-09-28). The keystone serves /cmd/stream + /cmd/ack behind
    // `tailscale serve --set-path /jarvis`. No connection opens until a bearer is set
    // (device-local, never synced), so a fresh install still no-ops cleanly.
    baseUrl: "https://mac-mini.tail1fd1c8.ts.net/jarvis",
    bearer: "",
    remoteControl: true,
    allowEval: false
  },
  board: {
    // daemonUrl re-pointed off dead d2 (100.122.18.7) to the live Mini sessions-daemon,
    // which binds the tailnet IP directly (100.82.86.21:8091) and is ACL-reachable from
    // iOS (tag:desktop tcp:8091). Serves GET /projects -> ProjectsPayload.
    forceWebTerm: false,
    daemonUrl: "http://100.82.86.21:8091",
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
function foldRemoteSeed(src, into) {
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
function seedFromLegacy(remoteData, boardData, pocketData) {
  const out = freshDefaults();
  if (isObj(remoteData)) foldRemoteSeed(remoteData, out.remote);
  if (isObj(boardData)) foldBoard(boardData, out.board);
  if (isObj(pocketData)) foldPocket(pocketData, out.ask, out.term);
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
  stopped = true;
  polling = false;
  /** Last command id seen; null until the first sync poll establishes the cursor. */
  cursor = null;
  clientId;
  dispatcher;
  start() {
    if (this.polling) return;
    this.stopped = false;
    this.cursor = null;
    void this.loop();
  }
  stop() {
    this.stopped = true;
  }
  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  /**
   * The long-poll loop. One request at a time: ask for anything after our cursor, the
   * keystone holds it open until a command arrives (or ~12s), we dispatch each and
   * re-poll from the returned cursor. `requestUrl` is used instead of fetch/EventSource
   * because it is the only HTTP path that works in Obsidian mobile's WKWebView without
   * tripping CORS. A 401/503/error backs off RETRY_MS rather than spinning.
   */
  async loop() {
    this.polling = true;
    try {
      while (!this.stopped) {
        const s = this.deps.getSettings();
        const base = trimBase(s.baseUrl);
        const bearer = s.bearer;
        if (!base || !bearer) {
          await this.sleep(RETRY_MS);
          continue;
        }
        try {
          const after = this.cursor;
          const url = base + "/cmd/poll?bearer=" + encodeURIComponent(bearer) + "&client=" + encodeURIComponent(this.clientId) + (after != null ? "&after=" + after : "");
          const r = await (0, import_obsidian2.requestUrl)({ url, method: "GET", throw: false });
          if (r.status === 200) {
            const body = r.json ?? JSON.parse(r.text);
            if (Array.isArray(body.cmds)) {
              for (const cmd of body.cmds) await this.dispatcher.execute(cmd);
            }
            if (typeof body.cursor === "number") this.cursor = body.cursor;
          } else {
            await this.sleep(RETRY_MS);
          }
        } catch {
          await this.sleep(RETRY_MS);
        }
      }
    } finally {
      this.polling = false;
    }
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

// src/ui/settings-tab.ts
var import_obsidian3 = require("obsidian");
var JarvisSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  /** Persist, then (for remote keys) re-open the command socket off the new values. */
  async save(restartRemote = false) {
    await this.plugin.saveSettings();
    if (restartRemote) this.plugin.restartRemote();
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    new import_obsidian3.Setting(containerEl).setName("Remote command channel").setHeading();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Tailnet-only, bearer-gated SSE channel. Deborah / the orchestrator pushes ops (open a note, run a command, append) and this device executes them. Nothing connects until both a base URL and a bearer are set."
    });
    new import_obsidian3.Setting(containerEl).setName("Enable remote control").setDesc("Hold the command socket open and execute pushed ops.").addToggle(
      (t) => t.setValue(s.remote.remoteControl).onChange(async (v) => {
        s.remote.remoteControl = v;
        await this.save(true);
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Base URL").setDesc("The keystone inbound, e.g. https://mac-mini.tail1fd1c8.ts.net/jarvis").addText(
      (t) => t.setPlaceholder("https://mac-mini.tail1fd1c8.ts.net/jarvis").setValue(s.remote.baseUrl).onChange(async (v) => {
        s.remote.baseUrl = v.trim();
        await this.save(true);
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Bearer (device-local)").setDesc(
      "ROOT key for the channel \u2014 a holder can run arbitrary ops against this vault. Stays on this device only (never synced, never committed). Must match the keystone's JARVIS_CMD_BEARER."
    ).addText((t) => {
      t.setPlaceholder("paste the device bearer").setValue(s.remote.bearer).onChange(async (v) => {
        s.remote.bearer = v.trim();
        await this.save(true);
      });
      t.inputEl.type = "password";
      t.inputEl.autocomplete = "off";
      t.inputEl.setAttribute("spellcheck", "false");
    });
    new import_obsidian3.Setting(containerEl).setName("Allow eval (danger)").setDesc(
      "Let the channel run arbitrary pushed JavaScript with full vault access. Off unless you are actively debugging \u2014 this is remote code execution."
    ).addToggle(
      (t) => t.setValue(s.remote.allowEval).onChange(async (v) => {
        s.remote.allowEval = v;
        await this.save(false);
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Board (sessions)").setHeading();
    new import_obsidian3.Setting(containerEl).setName("Daemon URL").setDesc("The sessions-daemon feeding the board. Tailnet-only.").addText(
      (t) => t.setPlaceholder("http://mac-mini.tail1fd1c8.ts.net:8091").setValue(s.board.daemonUrl).onChange(async (v) => {
        s.board.daemonUrl = v.trim();
        await this.save(false);
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Steer token").setDesc("Bearer for the daemon's steer endpoints. Only needed on a shell-less device.").addText((t) => {
      t.setValue(s.board.steerToken).onChange(async (v) => {
        s.board.steerToken = v.trim();
        await this.save(false);
      });
      t.inputEl.type = "password";
      t.inputEl.autocomplete = "off";
    });
    new import_obsidian3.Setting(containerEl).setName("Local fallback").setDesc("Run the zsh session engine directly when the daemon is unreachable (desktop only).").addToggle(
      (t) => t.setValue(s.board.localFallback).onChange(async (v) => {
        s.board.localFallback = v;
        await this.save(false);
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Force web terminal").setDesc("Use the browser terminal on this desktop too, to exercise the mobile path.").addToggle(
      (t) => t.setValue(s.board.forceWebTerm).onChange(async (v) => {
        s.board.forceWebTerm = v;
        await this.save(false);
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Force daemon steer").setDesc("Steer through the daemon on this desktop too, to exercise the mobile path.").addToggle(
      (t) => t.setValue(s.board.forceDaemonSteer).onChange(async (v) => {
        s.board.forceDaemonSteer = v;
        await this.save(false);
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Ask loop").setHeading();
    new import_obsidian3.Setting(containerEl).setName("Enable ask loop").setDesc("Poll po-broker for pending tap-cards and surface them.").addToggle(
      (t) => t.setValue(s.ask.askLoop).onChange(async (v) => {
        s.ask.askLoop = v;
        await this.save(false);
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Broker URL").setDesc("po-broker base, e.g. https://mac-mini.tail1fd1c8.ts.net:7890/po").addText(
      (t) => t.setPlaceholder("https://mac-mini.tail1fd1c8.ts.net:7890/po").setValue(s.ask.brokerUrl).onChange(async (v) => {
        s.ask.brokerUrl = v.trim();
        await this.save(false);
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Poll interval (ms)").setDesc("How often to poll GET /po/pending. Default 2000.").addText(
      (t) => t.setValue(String(s.ask.askPollMs)).onChange(async (v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 250) {
          s.ask.askPollMs = n;
          await this.save(false);
        }
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Terminal").setHeading();
    new import_obsidian3.Setting(containerEl).setName("WebSocket URL").setDesc("ttyd/websocket terminal front, e.g. wss://mac-mini.tail1fd1c8.ts.net:7890").addText(
      (t) => t.setPlaceholder("wss://mac-mini.tail1fd1c8.ts.net:7890").setValue(s.term.wsUrl).onChange(async (v) => {
        s.term.wsUrl = v.trim();
        await this.save(false);
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Session label").setDesc("tmux session the terminal attaches to (`tmux new -A -s <label>`).").addText(
      (t) => t.setValue(s.term.sessionLabel).onChange(async (v) => {
        s.term.sessionLabel = v.trim();
        await this.save(false);
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Auth token").setDesc("Bearer for the terminal websocket front.").addText((t) => {
      t.setValue(s.term.authToken).onChange(async (v) => {
        s.term.authToken = v.trim();
        await this.save(false);
      });
      t.inputEl.type = "password";
      t.inputEl.autocomplete = "off";
    });
    new import_obsidian3.Setting(containerEl).setName("Canvas renderer").setDesc("xterm.js canvas renderer. Leave OFF on broken-GPU boxes (webgl blanks the pane).").addToggle(
      (t) => t.setValue(s.term.useCanvasRenderer).onChange(async (v) => {
        s.term.useCanvasRenderer = v;
        await this.save(false);
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Show key bar").setDesc("On-screen key bar (iPad: Esc/Tab/Ctrl/arrows).").addToggle(
      (t) => t.setValue(s.term.showKeyBar).onChange(async (v) => {
        s.term.showKeyBar = v;
        await this.save(false);
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Copy on select").setDesc("Copy text to the clipboard the moment it is selected in the terminal.").addToggle(
      (t) => t.setValue(s.term.copyOnSelect).onChange(async (v) => {
        s.term.copyOnSelect = v;
        await this.save(false);
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Font size").setDesc("Terminal font size in px. Default 14.").addText(
      (t) => t.setValue(String(s.term.fontSize)).onChange(async (v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 6 && n <= 48) {
          s.term.fontSize = n;
          await this.save(false);
        }
      })
    );
  }
};

// src/main.ts
var VIEW_TYPE_BOARD = "jarvis-board";
var LEGACY_PLUGIN_IDS = {
  remote: "deborah-remote",
  board: "session-modal",
  pocket: "pocketoracle"
};
var BOARD_REFRESH_MS = 3e4;
var JarvisBoardView = class extends import_obsidian4.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  cards = [];
  status = "loading";
  errorMsg = "";
  getViewType() {
    return VIEW_TYPE_BOARD;
  }
  getDisplayText() {
    return "JARVIS board";
  }
  getIcon() {
    return "layout-grid";
  }
  async onOpen() {
    this.draw();
    await this.refresh();
    this.registerInterval(
      window.setInterval(() => void this.refresh(), BOARD_REFRESH_MS)
    );
  }
  /** Pull the ranked project feed from the daemon and redraw. */
  async refresh() {
    const base = this.plugin.settings.board.daemonUrl.replace(/\/+$/, "");
    if (!base) {
      this.status = "error";
      this.errorMsg = "No daemon URL set (Settings \u2192 JARVIS Surface \u2192 Board).";
      this.draw();
      return;
    }
    const url = base + "/projects";
    try {
      const r = await (0, import_obsidian4.requestUrl)({ url, method: "GET", throw: false });
      if (r.status !== 200) {
        this.status = "error";
        this.errorMsg = `Daemon returned ${r.status} at ${url}`;
        this.draw();
        return;
      }
      const payload = r.json ?? JSON.parse(r.text);
      this.cards = Array.isArray(payload.projects) ? payload.projects : [];
      this.status = "ok";
      this.draw();
    } catch {
      this.status = "error";
      this.errorMsg = `Daemon unreachable at ${url} \u2014 is Tailscale on?`;
      this.draw();
    }
  }
  draw() {
    const root = this.contentEl;
    root.empty();
    root.addClass("jarvis-board");
    const head = root.createDiv({ cls: "jarvis-board-head" });
    const title = this.status === "ok" ? `${this.cards.length} project${this.cards.length === 1 ? "" : "s"}` : this.status === "loading" ? "Loading\u2026" : "Board";
    head.createSpan({ cls: "jarvis-board-title", text: title });
    const btn = head.createEl("button", {
      cls: "jarvis-board-refresh",
      text: "\u21BB",
      attr: { "aria-label": "Refresh" }
    });
    btn.addEventListener("click", () => void this.refresh());
    if (this.status === "loading") {
      root.createDiv({ cls: "cockpit-empty", text: "Loading the project feed\u2026" });
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
    for (const card of this.cards) {
      renderCard(root, card, {
        onPick: (c) => {
          void this.plugin.app.workspace.openLinkText(
            `01-Projects/${c.slug}/CONTINUE.md`,
            "",
            false
          );
        }
      });
    }
  }
};
var JarvisSurfacePlugin = class extends import_obsidian4.Plugin {
  settings = DEFAULT_SETTINGS;
  /** The tailnet remote-control channel (deborah-remote port). Null until gated on. */
  remote = null;
  async onload() {
    const raw = await this.loadData();
    const firstRun = !raw || raw.schemaVersion !== 1;
    if (firstRun) {
      const legacy = await this.loadLegacyData();
      this.settings = legacy ? seedFromLegacy(legacy.remote, legacy.board, legacy.pocket) : migrateSettings(raw);
      await this.saveData(this.settings);
    } else {
      this.settings = migrateSettings(raw);
    }
    this.registerView(VIEW_TYPE_BOARD, (leaf) => new JarvisBoardView(leaf, this));
    this.addRibbonIcon("layout-grid", "JARVIS board", () => {
      void this.openBoard();
    });
    this.addCommand({
      id: "open-board",
      name: "Open the JARVIS board",
      callback: () => void this.openBoard()
    });
    this.addSettingTab(new JarvisSettingTab(this.app, this));
    this.restartRemote();
  }
  onunload() {
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
  restartRemote() {
    this.remote?.stop();
    this.remote = null;
    const r = this.settings.remote;
    if (!(r.remoteControl && r.baseUrl && r.bearer)) return;
    this.remote = new RemoteClient({
      app: this.app,
      plugin: this,
      getSettings: () => this.settings.remote,
      // Closest surface available until the stream-view port lands.
      openStream: () => this.openBoard()
    });
    this.remote.start();
  }
  /**
   * LiveSync replicates data.json across devices and will clobber it under a running
   * plugin. Obsidian calls this when the file changes on disk; re-migrate rather than
   * trust the in-memory copy, so a value another device wrote actually takes effect.
   */
  async onExternalSettingsChange() {
    this.settings = migrateSettings(await this.loadData());
    this.restartRemote();
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  /**
   * Read the three legacy plugins' `data.json` straight off the vault adapter (they
   * live at `<configDir>/plugins/<id>/data.json`). Returns the parsed bags, or null
   * if NONE of the three exist — so the caller can tell a real cutover from a fresh
   * install. A present-but-unparseable file reads as null for that slot;
   * `seedFromLegacy` treats a null slot as "take defaults".
   */
  async loadLegacyData() {
    const read = async (id) => {
      const p = `${this.app.vault.configDir}/plugins/${id}/data.json`;
      try {
        if (!await this.app.vault.adapter.exists(p)) return null;
        return JSON.parse(await this.app.vault.adapter.read(p));
      } catch {
        return null;
      }
    };
    const [remote, board, pocket] = await Promise.all([
      read(LEGACY_PLUGIN_IDS.remote),
      read(LEGACY_PLUGIN_IDS.board),
      read(LEGACY_PLUGIN_IDS.pocket)
    ]);
    if (remote == null && board == null && pocket == null) return null;
    return { remote, board, pocket };
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
