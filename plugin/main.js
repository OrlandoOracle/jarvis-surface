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
var import_obsidian8 = require("obsidian");

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

// src/views/dashboard.ts
var import_obsidian2 = require("obsidian");

// src/views/continue-doc.ts
var EMPTY_CONTINUE = {
  status: "",
  decided: [],
  next: [],
  gates: []
};
function splitFrontmatter(md) {
  if (!md.startsWith("---")) return ["", md];
  const end = md.indexOf("\n---", 3);
  if (end < 0) return ["", md];
  const fmEnd = md.indexOf("\n", end + 1);
  return [md.slice(3, end), md.slice(fmEnd < 0 ? md.length : fmEnd + 1)];
}
function frontmatterStatus(fm) {
  for (const line of fm.split("\n")) {
    const m = /^status:\s*(.*)$/.exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}
function sectionLines(body, name) {
  const lines = body.split("\n");
  const out = [];
  let inSection = false;
  const head = new RegExp("^#{1,6}\\s+" + name + "\\s*$", "i");
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      if (inSection) break;
      inSection = head.test(line);
      continue;
    }
    if (inSection) out.push(line);
  }
  return out;
}
function bullets(lines) {
  const out = [];
  for (const raw of lines) {
    const m = /^\s*[-*]\s+(.*)$/.exec(raw);
    if (m && m[1].trim()) out.push(m[1].trim());
  }
  return out;
}
function parseContinue(md) {
  if (!md || typeof md !== "string") return { ...EMPTY_CONTINUE };
  const [fm, body] = splitFrontmatter(md);
  const decided = bullets(sectionLines(body, "Decided"));
  const gates = bullets(sectionLines(body, "Gates"));
  const next = bullets(sectionLines(body, "Next")).filter((b) => !/^\[[xX]\]/.test(b)).map((b) => b.replace(/^\[\s?\]\s*/, "").trim()).filter(Boolean);
  return {
    status: frontmatterStatus(fm),
    decided,
    gates,
    next
  };
}

// src/views/steer.ts
var import_obsidian = require("obsidian");
function trimBase(u) {
  return (u || "").replace(/\/+$/, "");
}
var SteerClient = class {
  constructor(base, token) {
    this.base = base;
    this.token = token;
  }
  /** True only when both an endpoint and a bearer are present — the modal greys the
   *  steer controls otherwise rather than firing a request that can only 401/404. */
  get configured() {
    return !!trimBase(this.base) && !!this.token;
  }
  authHeaders() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json"
    };
  }
  errFrom(status, text) {
    try {
      const j = JSON.parse(text);
      if (j && typeof j.error === "string") return j.error;
    } catch {
    }
    return text ? text.slice(0, 200) : `HTTP ${status}`;
  }
  /** Read what the pane is CURRENTLY asking. Pane ids start with "%", so the query is
   *  encodeURIComponent'd — an undecoded "%6" becomes "%256" daemon-side and finds no
   *  pane (a bug the daemon's own comments call out). */
  async menu(host, pane) {
    if (!this.configured) {
      return { kind: "error", status: 0, error: "steering not configured" };
    }
    const url = trimBase(this.base) + "/menu?host=" + encodeURIComponent(host) + "&pane=" + encodeURIComponent(pane);
    try {
      const r = await (0, import_obsidian.requestUrl)({
        url,
        method: "GET",
        headers: { Authorization: `Bearer ${this.token}` },
        throw: false
      });
      if (r.status !== 200) {
        return { kind: "error", status: r.status, error: this.errFrom(r.status, r.text) };
      }
      const body = r.json ?? JSON.parse(r.text);
      if (body.menu && Array.isArray(body.menu.options) && body.menu.options.length) {
        return { kind: "menu", menu: body.menu };
      }
      return { kind: "none", tail: body.tail ?? "" };
    } catch (e) {
      return { kind: "error", status: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }
  async post(sub, payload, okDetail) {
    if (!this.configured) {
      return { kind: "error", status: 0, error: "steering not configured" };
    }
    try {
      const r = await (0, import_obsidian.requestUrl)({
        url: trimBase(this.base) + sub,
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify(payload),
        throw: false
      });
      if (r.status === 200) {
        const body = r.json ?? JSON.parse(r.text);
        return { kind: "ok", detail: okDetail(body) };
      }
      if (r.status === 409) {
        return { kind: "refused", error: this.errFrom(r.status, r.text) };
      }
      return { kind: "error", status: r.status, error: this.errFrom(r.status, r.text) };
    } catch (e) {
      return { kind: "error", status: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }
  /** Type one line into the pane and press Enter. Daemon refuses newlines / over-long lines. */
  say(host, pane, text) {
    return this.post("/say", { host, pane, text }, (b) => `said: ${String(b.said ?? text)}`);
  }
  /** Pick 0-based `option` of the menu the pane is CURRENTLY showing. `expect` is the
   *  option text we rendered — the daemon refuses (409) if the menu moved since, so a
   *  slow tap can never answer a question that has already changed. */
  choose(host, pane, option, expect) {
    return this.post(
      "/choose",
      { host, pane, option, ...expect != null ? { expect } : {} },
      (b) => `chose: ${String(b.chose ?? option)}`
    );
  }
  /** Send ESC — cancel the pane's current prompt. */
  interrupt(host, pane) {
    return this.post("/interrupt", { host, pane }, () => "interrupted");
  }
};

// src/views/dashboard.ts
var REFRESH_MS = 5e3;
var NOTE_PEEK = 600;
function trimBase2(u) {
  return (u || "").replace(/\/+$/, "");
}
var DashboardModal = class extends import_obsidian2.Modal {
  // Constructor-assigned, NOT class-field initializers: esbuild (es2018) emits native
  // class fields that the iOS Obsidian WebView does not run on a Modal subclass, which
  // left AskModal blank on the iPad. Assign in the constructor body so it always runs.
  deps;
  card;
  doc;
  panels;
  timer;
  /** The menu the pane is currently asking, when the approve/reject panel is open. */
  menuOpen;
  constructor(deps, card) {
    super(deps.app);
    this.deps = deps;
    this.card = card;
    this.doc = { ...EMPTY_CONTINUE };
    this.panels = [];
    this.timer = null;
    this.menuOpen = false;
  }
  get slug() {
    return this.card.slug;
  }
  steer() {
    const b = this.deps.getSettings().board;
    return new SteerClient(b.daemonUrl, b.steerToken);
  }
  onOpen() {
    this.modalEl.addClass("jarvis-dash");
    this.draw();
    void this.loadDoc();
    void this.loadPanels();
    void this.refreshCard();
    this.timer = window.setInterval(() => void this.refreshCard(), REFRESH_MS);
  }
  onClose() {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
    this.contentEl.empty();
  }
  // --- async loads -------------------------------------------------------------
  /** Read + parse this project's CONTINUE.md off the vault adapter (iOS-safe). A project
   *  that lives in another vault (e.g. ~/PersonalVault) or has no CONTINUE.md simply
   *  leaves `doc` empty and the modal falls back to the daemon card. */
  async loadDoc() {
    const path = `01-Projects/${this.slug}/CONTINUE.md`;
    try {
      const adapter = this.deps.app.vault.adapter;
      if (!await adapter.exists(path)) return;
      this.doc = parseContinue(await adapter.read(path));
      this.draw();
    } catch {
    }
  }
  /** Read an optional `dashboard.yaml` for extra panels (the "shared + overrides" ruling).
   *  Absent / malformed → no panels, never an error. */
  async loadPanels() {
    const path = `01-Projects/${this.slug}/dashboard.yaml`;
    try {
      const adapter = this.deps.app.vault.adapter;
      if (!await adapter.exists(path)) return;
      const parsed = (0, import_obsidian2.parseYaml)(await adapter.read(path));
      if (parsed && Array.isArray(parsed.panels)) {
        this.panels = parsed.panels.filter((p) => !!p && typeof p.title === "string").map((p) => ({ title: p.title, note: p.note, text: p.text }));
        this.draw();
      }
    } catch {
    }
  }
  /** Re-pull the ranked feed and refresh THIS card (badge/status/next go live). Quiet on
   *  failure — a transient daemon blip must not blank a modal the user is reading. */
  async refreshCard() {
    const base = trimBase2(this.deps.getSettings().board.daemonUrl);
    if (!base) return;
    try {
      const r = await (0, import_obsidian2.requestUrl)({ url: base + "/projects", method: "GET", throw: false });
      if (r.status !== 200) return;
      const payload = r.json ?? JSON.parse(r.text);
      const fresh = (payload.projects ?? []).find((c) => c.slug === this.slug);
      if (fresh) {
        this.card = fresh;
        this.draw();
      }
    } catch {
    }
  }
  // --- render ------------------------------------------------------------------
  draw() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("jarvis-dash-content");
    const live = this.card.live ?? null;
    const head = contentEl.createDiv({ cls: "jarvis-dash-head" });
    head.createEl("div", { cls: "jarvis-dash-brand", text: "\u25C6 JARVIS \xB7 project" });
    const titleRow = head.createDiv({ cls: "jarvis-dash-titlerow" });
    titleRow.createEl("div", { cls: "jarvis-dash-title", text: this.slug });
    const badge = titleRow.createDiv({ cls: "jarvis-dash-badge" });
    if (live) {
      badge.createSpan({ cls: `cockpit-dot cockpit-dot--${live.status}`, text: LIVE_DOT[live.status] });
      badge.createSpan({ cls: "jarvis-dash-state", text: live.status });
      if (live.host_key) badge.createSpan({ cls: "jarvis-dash-host", text: live.host_key });
      if (!live.injectable) badge.createSpan({ cls: "jarvis-dash-monitor", text: "monitor-only" });
    } else if (this.card.session) {
      badge.createSpan({ cls: "cockpit-dot cockpit-dot--unknown", text: "\u25CD" });
      badge.createSpan({ cls: "jarvis-dash-state", text: "up, no beacon" });
    } else {
      badge.createSpan({ cls: "cockpit-dot cockpit-dot--cold", text: "\u25CB" });
      badge.createSpan({ cls: "jarvis-dash-state", text: "idle" });
    }
    const status = this.doc.status || this.card.status || "\u2014";
    contentEl.createDiv({ cls: "jarvis-dash-status", text: status });
    const nextText = this.card.next || this.doc.next[0] || "";
    contentEl.createDiv({ cls: "jarvis-dash-next" }).createSpan({
      cls: nextText ? "jarvis-dash-next-text" : "jarvis-dash-next-text jarvis-dash-next-text--none",
      text: nextText ? `NEXT \u2192 ${nextText}` : "NEXT \u2192 \u2014"
    });
    this.drawControls(contentEl, live);
    if (this.doc.decided.length) this.drawList(contentEl, "Decided", this.doc.decided.slice(-6));
    if (this.doc.gates.length) this.drawList(contentEl, "Gates", this.doc.gates.slice(0, 6));
    if (this.doc.next.length > 1) this.drawList(contentEl, "Next", this.doc.next.slice(0, 6));
    for (const p of this.panels) this.drawPanel(contentEl, p);
    const foot = contentEl.createDiv({ cls: "jarvis-dash-foot" });
    const openNote = foot.createEl("button", { cls: "jarvis-dash-btn jarvis-dash-btn--ghost", text: "open CONTINUE.md" });
    openNote.addEventListener("click", () => {
      void this.deps.app.workspace.openLinkText(`01-Projects/${this.slug}/CONTINUE.md`, "", false);
      this.close();
    });
  }
  drawControls(parent, live) {
    const injectable = !!live?.injectable;
    const host = live?.host_key ?? live?.host ?? "";
    const pane = live?.pane ?? "";
    const wrap = parent.createDiv({ cls: "jarvis-dash-controls" });
    const resume = wrap.createEl("button", { cls: "jarvis-dash-btn jarvis-dash-btn--primary" });
    resume.setText(live ? "open terminal \u29C9" : "resume / open terminal \u29C9");
    resume.addEventListener("click", () => this.openTerminal());
    const esc = wrap.createEl("button", { cls: "jarvis-dash-btn", text: "interrupt \u238B" });
    esc.disabled = !injectable;
    esc.addEventListener("click", () => void this.doInterrupt(host, pane, esc));
    const approve = wrap.createEl("button", { cls: "jarvis-dash-btn", text: "answer prompt \u25B8" });
    approve.disabled = !injectable;
    approve.addEventListener("click", () => void this.toggleMenu(host, pane, parent));
    const steerRow = parent.createDiv({ cls: "jarvis-dash-steerrow" });
    const input = steerRow.createEl("input", {
      cls: "jarvis-dash-steerinput",
      attr: { type: "text", placeholder: injectable ? "Steer: type a line\u2026" : "No live pane to steer" }
    });
    input.disabled = !injectable;
    const send = steerRow.createEl("button", { cls: "jarvis-dash-btn jarvis-dash-btn--primary", text: "send" });
    send.disabled = !injectable;
    const fire = () => {
      const text = input.value.trim();
      if (!text) return;
      void this.doSay(host, pane, text, send, input);
    };
    send.addEventListener("click", fire);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") fire();
    });
    if (this.menuOpen) this.drawMenuPanel(parent, host, pane);
  }
  openTerminal() {
    const term = this.deps.getSettings().term;
    if (!term.wsUrl) {
      new import_obsidian2.Notice("Terminal not configured (Settings \u2192 JARVIS Surface \u2192 Terminal). The ttyd view is a follow-on unit.");
      return;
    }
    let httpUrl = term.wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    try {
      const u = new URL(httpUrl);
      httpUrl = `${u.protocol}//${u.host}/`;
    } catch {
    }
    if (import_obsidian2.Platform.isMobile) {
      new import_obsidian2.Notice(`Terminal: ${httpUrl} (in-plugin term view is a follow-on unit)`);
    } else {
      window.open(httpUrl, "_blank");
    }
  }
  async doInterrupt(host, pane, btn) {
    btn.disabled = true;
    const r = await this.steer().interrupt(host, pane);
    this.reportSteer(r, "Interrupt sent");
    btn.disabled = false;
  }
  async doSay(host, pane, text, btn, input) {
    btn.disabled = true;
    const r = await this.steer().say(host, pane, text);
    this.reportSteer(r, `Sent: ${text}`);
    if (r.kind === "ok") input.value = "";
    btn.disabled = false;
  }
  toggleMenu(host, pane, parent) {
    this.menuOpen = !this.menuOpen;
    this.draw();
  }
  /** Render the pane's current menu as tap-to-choose options (approve/reject = pick N). */
  async drawMenuPanel(parent, host, pane) {
    const box = parent.createDiv({ cls: "jarvis-dash-menu" });
    box.createEl("div", { cls: "jarvis-dash-menu-load", text: "Reading the prompt\u2026" });
    const res = await this.steer().menu(host, pane);
    box.empty();
    if (res.kind === "error") {
      box.createEl("div", { cls: "jarvis-dash-menu-err", text: `Could not read the prompt: ${res.error}` });
      return;
    }
    if (res.kind === "none") {
      box.createEl("div", { cls: "jarvis-dash-menu-none", text: "The pane is not showing a menu right now." });
      return;
    }
    box.createEl("div", { cls: "jarvis-dash-menu-q", text: res.menu.question || "(no question text)" });
    res.menu.options.forEach((opt, i) => {
      const b = box.createEl("button", { cls: "jarvis-dash-menu-opt" });
      b.createEl("span", { cls: "jarvis-dash-menu-n", text: String(i + 1) });
      b.createEl("span", { cls: "jarvis-dash-menu-label", text: opt });
      b.addEventListener("click", () => void this.doChoose(host, pane, i, opt, b));
    });
  }
  async doChoose(host, pane, option, expect, btn) {
    btn.disabled = true;
    btn.addClass("is-choosing");
    const r = await this.steer().choose(host, pane, option, expect);
    this.reportSteer(r, `Chose: ${expect}`);
    if (r.kind === "ok") {
      this.menuOpen = false;
      this.draw();
    } else {
      btn.disabled = false;
      btn.removeClass("is-choosing");
    }
  }
  reportSteer(r, okMsg) {
    if (r.kind === "ok") new import_obsidian2.Notice(okMsg);
    else if (r.kind === "refused") new import_obsidian2.Notice(`Refused: ${r.error}`);
    else new import_obsidian2.Notice(`Steer failed: ${r.error}`);
  }
  drawList(parent, title, items) {
    const sec = parent.createDiv({ cls: "jarvis-dash-sec" });
    sec.createEl("div", { cls: "jarvis-dash-sec-title", text: title });
    const ul = sec.createEl("ul", { cls: "jarvis-dash-sec-list" });
    for (const it of items) ul.createEl("li", { text: it });
  }
  async drawPanel(parent, p) {
    const sec = parent.createDiv({ cls: "jarvis-dash-sec jarvis-dash-sec--panel" });
    sec.createEl("div", { cls: "jarvis-dash-sec-title", text: p.title });
    if (p.text) {
      sec.createEl("div", { cls: "jarvis-dash-panel-text", text: p.text });
      return;
    }
    if (p.note) {
      const body = sec.createEl("div", { cls: "jarvis-dash-panel-text", text: "\u2026" });
      try {
        const adapter = this.deps.app.vault.adapter;
        if (await adapter.exists(p.note)) {
          const raw = await adapter.read(p.note);
          body.setText(raw.slice(0, NOTE_PEEK) + (raw.length > NOTE_PEEK ? "\u2026" : ""));
        } else {
          body.setText(`(missing: ${p.note})`);
        }
      } catch {
        body.setText(`(unreadable: ${p.note})`);
      }
    }
  }
};

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
    // The board reads /projects from here. It points at the keystone's HTTPS 443 front
    // (NOT the daemon's raw http://…:8091) because iOS ATS blocks cleartext HTTP from
    // requestUrl — the keystone proxies the daemon over TLS so the board works on mobile.
    forceWebTerm: false,
    daemonUrl: "https://mac-mini.tail1fd1c8.ts.net/jarvis",
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
  normalizeDaemonUrl(into);
}
function normalizeDaemonUrl(into) {
  const u = into.daemonUrl || "";
  if (/:8091(\/|$)/.test(u) || /100\.122\.18\.7/.test(u) || u.startsWith("http://")) {
    into.daemonUrl = DEFAULT_SETTINGS.board.daemonUrl;
  }
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
var import_obsidian4 = require("obsidian");

// src/remote/dispatcher.ts
var obsidian = __toESM(require("obsidian"), 1);
var import_obsidian3 = require("obsidian");
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
    return af instanceof import_obsidian3.TFile ? af : null;
  }
  // Flip the active markdown view between Reading (preview) and Source. Anything
  // that is not "reading"/"preview" means Source, exactly as the original.
  async setMode(mode) {
    const view = this.deps.app.workspace.getActiveViewOfType(import_obsidian3.MarkdownView);
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
      new import_obsidian3.Notice("JARVIS remote: refused a pushed eval (fenced)");
      return;
    }
    if (cmd.op !== "eval" && !ALLOWED_OPS.includes(cmd.op)) {
      await ack(cmd.id, false, "refused: op not in allow-list");
      return;
    }
    try {
      switch (cmd.op) {
        case "notice":
          new import_obsidian3.Notice(String(cmd.msg ?? ""));
          break;
        case "open":
          await app.workspace.openLinkText(cmd.path ?? "", "", !!cmd.newLeaf);
          if (cmd.mode) await this.setMode(cmd.mode);
          break;
        case "openstream":
          if (this.deps.openStream) await this.deps.openStream();
          else new import_obsidian3.Notice("JARVIS remote: stream view is not ported in this build");
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
      new import_obsidian3.Notice("JARVIS remote: " + msg);
    }
  }
};

// src/remote/client.ts
function trimBase3(u) {
  return (u || "").replace(/\/+$/, "");
}
function genClientId() {
  const P = import_obsidian4.Platform;
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
        const base = trimBase3(s.baseUrl);
        const bearer = s.bearer;
        if (!base || !bearer) {
          await this.sleep(RETRY_MS);
          continue;
        }
        try {
          const after = this.cursor;
          const url = base + "/cmd/poll?bearer=" + encodeURIComponent(bearer) + "&client=" + encodeURIComponent(this.clientId) + (after != null ? "&after=" + after : "");
          const r = await (0, import_obsidian4.requestUrl)({ url, method: "GET", throw: false });
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
    const base = trimBase3(s.baseUrl);
    if (!base || !s.bearer) return;
    try {
      await (0, import_obsidian4.requestUrl)({
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

// src/ask/ask-loop.ts
var import_obsidian6 = require("obsidian");

// src/ask/ask-modal.ts
var import_obsidian5 = require("obsidian");
var AskModal = class extends import_obsidian5.Modal {
  qid;
  questions;
  settleFn;
  done;
  timer;
  ttlMs;
  /** Per-question current selection. Single: one label. Multi: a Set of labels. */
  selection;
  /** Per-question free-text value when the "Type…" path is used. */
  typed;
  submitBtn;
  result;
  // NB: every field is assigned here in the constructor body — NOT via class-field
  // initializers. esbuild (target es2018) emitted the initializers as *native*
  // class fields, and the iOS Obsidian WebView does not run subclass field
  // initializers (AskModal extends Obsidian's Modal), leaving this.selection
  // undefined → a blank modal on the iPad. Constructor assignment always runs.
  constructor(app, qid, questions, ttlMs) {
    super(app);
    this.qid = qid;
    this.questions = questions;
    this.ttlMs = ttlMs;
    this.done = false;
    this.timer = null;
    this.selection = /* @__PURE__ */ new Map();
    this.typed = /* @__PURE__ */ new Map();
    this.submitBtn = null;
    this.result = new Promise((res) => this.settleFn = res);
  }
  finish(r) {
    if (this.done) return;
    this.done = true;
    if (this.timer != null) window.clearTimeout(this.timer);
    this.settleFn(r);
    this.close();
  }
  /** Called by the loop when another device answered first, or it timed out. */
  supersede(reason) {
    this.finish(reason === "timeout" ? { kind: "timeout" } : { kind: "cancel" });
  }
  get singleFast() {
    return this.questions.length === 1 && !this.questions[0].multiSelect;
  }
  buildAnswers() {
    const out = {};
    this.questions.forEach((q, i) => {
      const t = this.typed.get(i);
      if (t && t.trim()) {
        out[q.question] = t.trim();
        return;
      }
      const sel = this.selection.get(i);
      if (sel && sel.size) out[q.question] = [...sel].join(", ");
    });
    return out;
  }
  everyAnswered() {
    return this.questions.every((q, i) => {
      const t = this.typed.get(i);
      if (t && t.trim()) return true;
      const sel = this.selection.get(i);
      return !!sel && sel.size > 0;
    });
  }
  refreshSubmit() {
    if (this.submitBtn) this.submitBtn.disabled = !this.everyAnswered();
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    this.selection = /* @__PURE__ */ new Map();
    this.typed = /* @__PURE__ */ new Map();
    modalEl.addClass("po-ask");
    contentEl.empty();
    contentEl.addClass("po-ask-content");
    contentEl.createEl("div", { cls: "po-ask-brand", text: "\u25C6 Oracle \xB7 Claude is asking" });
    const qs = this.questions;
    if (!Array.isArray(qs) || qs.length === 0) {
      contentEl.createEl("div", {
        cls: "po-ask-error",
        text: `no questions to render (got: ${Object.prototype.toString.call(qs)})`
      });
    }
    try {
      (Array.isArray(qs) ? qs : []).forEach((q, qi) => {
        this.selection.set(qi, /* @__PURE__ */ new Set());
        const section = contentEl.createDiv({ cls: "po-ask-q" });
        if (q.header) section.createEl("div", { cls: "po-ask-header", text: q.header });
        section.createEl("div", { cls: "po-ask-question", text: q.question });
        const opts = section.createDiv({ cls: "po-ask-options" });
        q.options.forEach((opt, oi) => {
          const btn = opts.createEl("button", { cls: "po-ask-option" });
          btn.style.setProperty("--i", String(oi));
          btn.createEl("div", { cls: "po-ask-num", text: String(oi + 1) });
          btn.createEl("div", { cls: "po-ask-option-label", text: opt.label });
          if (opt.description) {
            btn.createEl("div", { cls: "po-ask-option-desc", text: opt.description });
          }
          btn.createEl("div", { cls: "po-ask-check", text: "\u2713" });
          btn.addEventListener("click", () => this.onOptionTap(qi, q, opt.label, btn, opts));
        });
        const typeRow = section.createDiv({ cls: "po-ask-typerow" });
        const typeBtn = typeRow.createEl("button", {
          cls: "po-ask-type",
          text: "Type or dictate your own"
        });
        typeBtn.addEventListener("click", () => {
          if (section.querySelector("textarea")) return;
          const ta = section.createEl("textarea", { cls: "po-ask-textarea" });
          ta.placeholder = "Type or dictate your answer\u2026";
          let localSend = null;
          if (this.singleFast) {
            localSend = section.createEl("button", { cls: "po-ask-submit po-ask-send", text: "Send" });
            localSend.disabled = true;
            localSend.addEventListener("click", () => {
              if (this.everyAnswered()) this.finish({ kind: "answered", answers: this.buildAnswers() });
            });
          }
          ta.addEventListener("input", () => {
            this.typed.set(qi, ta.value);
            this.selection.get(qi)?.clear();
            opts.querySelectorAll(".po-ask-option.is-selected").forEach(
              (e) => e.removeClass("is-selected")
            );
            if (localSend) localSend.disabled = !ta.value.trim();
            this.refreshSubmit();
          });
          ta.focus();
        });
      });
    } catch (err) {
      contentEl.createEl("div", {
        cls: "po-ask-error",
        text: `render error: ${err instanceof Error ? err.message : String(err)}`
      });
    }
    const actions = contentEl.createDiv({ cls: "po-ask-actions" });
    if (!this.singleFast) {
      const submit = actions.createEl("button", { cls: "po-ask-submit", text: "Submit" });
      submit.disabled = true;
      submit.addEventListener("click", () => {
        if (this.everyAnswered()) this.finish({ kind: "answered", answers: this.buildAnswers() });
      });
      this.submitBtn = submit;
    }
    const cancel = actions.createEl("button", { cls: "po-ask-cancel", text: "Cancel" });
    cancel.addEventListener("click", () => this.finish({ kind: "cancel" }));
    this.timer = window.setTimeout(() => this.finish({ kind: "timeout" }), this.ttlMs);
  }
  onOptionTap(qi, q, label, btn, opts) {
    this.typed.delete(qi);
    const sel = this.selection.get(qi);
    if (q.multiSelect) {
      if (sel.has(label)) {
        sel.delete(label);
        btn.removeClass("is-selected");
      } else {
        sel.add(label);
        btn.addClass("is-selected");
      }
      this.refreshSubmit();
      return;
    }
    sel.clear();
    sel.add(label);
    opts.querySelectorAll(".po-ask-option.is-selected").forEach((e) => e.removeClass("is-selected"));
    btn.addClass("is-selected");
    if (this.singleFast) {
      this.flourish(btn);
      window.setTimeout(() => this.finish({ kind: "answered", answers: this.buildAnswers() }), 240);
    } else {
      this.refreshSubmit();
    }
  }
  /** Gold tap-confirm flourish: pop/flash the chosen card + a center ring-pulse
   *  beat spawned on <body> (survives the modal close, self-removes). */
  flourish(btn) {
    btn.addClass("confirming");
    const beat = document.body.createDiv({ cls: "po-ask-beat" });
    window.setTimeout(() => beat.remove(), 500);
  }
  onClose() {
    this.contentEl.empty();
    this.finish({ kind: "cancel" });
  }
};

// src/ask/ask-loop.ts
var AskLoop = class {
  app;
  brokerBase;
  // e.g. https://mac-mini.tail1fd1c8.ts.net:7890/po
  ttlMs;
  pollMs;
  timer = null;
  polling = false;
  stopped = false;
  modals = /* @__PURE__ */ new Map();
  /**
   * qids this device has already surfaced-and-closed (cancel/timeout). The ask
   * may still be pending on the broker (another device could answer, or its TTL
   * will expire it), but THIS device must not reopen it every poll — that was the
   * modal-reopen loop. Pruned when the qid leaves /po/pending.
   */
  closed = /* @__PURE__ */ new Set();
  onVisibility = () => {
    if (document.visibilityState === "visible") void this.pollOnce();
  };
  constructor(app, brokerBase, opts) {
    this.app = app;
    this.brokerBase = brokerBase.replace(/\/$/, "");
    this.ttlMs = opts.ttlMs;
    this.pollMs = opts.pollMs;
  }
  start() {
    if (this.timer != null) return;
    this.stopped = false;
    document.addEventListener("visibilitychange", this.onVisibility);
    const tick = () => {
      void this.pollOnce();
      this.timer = window.setTimeout(tick, this.pollMs);
    };
    tick();
  }
  stop() {
    this.stopped = true;
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = null;
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const m of this.modals.values()) m.supersede("timeout");
    this.modals.clear();
  }
  async pollOnce() {
    if (this.polling || this.stopped) return;
    this.polling = true;
    try {
      const res = await (0, import_obsidian6.requestUrl)({
        url: `${this.brokerBase}/pending`,
        method: "GET",
        throw: false
      });
      if (res.status !== 200) return;
      const pending = res.json?.pending ?? [];
      const live = new Set(pending.map((p) => p.qid));
      for (const [qid, modal] of [...this.modals]) {
        if (!live.has(qid)) {
          modal.supersede("timeout");
          this.modals.delete(qid);
        }
      }
      for (const qid of [...this.closed]) {
        if (!live.has(qid)) this.closed.delete(qid);
      }
      for (const ask of pending) {
        if (this.modals.has(ask.qid) || this.closed.has(ask.qid)) continue;
        this.openModal(ask);
      }
    } catch {
    } finally {
      this.polling = false;
    }
  }
  openModal(ask) {
    const remaining = Math.max(5e3, Math.min(this.ttlMs, ask.exp - Date.now()));
    const modal = new AskModal(this.app, ask.qid, ask.questions, remaining);
    this.modals.set(ask.qid, modal);
    modal.open();
    void modal.result.then((r) => {
      this.modals.delete(ask.qid);
      if (r.kind === "answered") {
        void this.postAnswer(ask.qid, r.answers);
      } else {
        this.closed.add(ask.qid);
      }
    });
  }
  async postAnswer(qid, answers) {
    try {
      await (0, import_obsidian6.requestUrl)({
        url: `${this.brokerBase}/answer`,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qid, answers }),
        throw: false
      });
    } catch {
    }
  }
};

// src/ui/settings-tab.ts
var import_obsidian7 = require("obsidian");
var JarvisSettingTab = class extends import_obsidian7.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  /**
   * Persist, then re-arm the affected subsystem off the new values: the command socket
   * (remote keys) and/or the ask-loop poller (ask keys). Each client snapshots its
   * config at start, so without the restart a changed URL/bearer/cadence would not take
   * effect until an Obsidian reload.
   */
  async save(restartRemote = false, restartAsk = false) {
    await this.plugin.saveSettings();
    if (restartRemote) this.plugin.restartRemote();
    if (restartAsk) this.plugin.restartAsk();
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    new import_obsidian7.Setting(containerEl).setName("Remote command channel").setHeading();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Tailnet-only, bearer-gated SSE channel. Deborah / the orchestrator pushes ops (open a note, run a command, append) and this device executes them. Nothing connects until both a base URL and a bearer are set."
    });
    new import_obsidian7.Setting(containerEl).setName("Enable remote control").setDesc("Hold the command socket open and execute pushed ops.").addToggle(
      (t) => t.setValue(s.remote.remoteControl).onChange(async (v) => {
        s.remote.remoteControl = v;
        await this.save(true);
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Base URL").setDesc("The keystone inbound, e.g. https://mac-mini.tail1fd1c8.ts.net/jarvis").addText(
      (t) => t.setPlaceholder("https://mac-mini.tail1fd1c8.ts.net/jarvis").setValue(s.remote.baseUrl).onChange(async (v) => {
        s.remote.baseUrl = v.trim();
        await this.save(true);
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Bearer (device-local)").setDesc(
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
    new import_obsidian7.Setting(containerEl).setName("Allow eval (danger)").setDesc(
      "Let the channel run arbitrary pushed JavaScript with full vault access. Off unless you are actively debugging \u2014 this is remote code execution."
    ).addToggle(
      (t) => t.setValue(s.remote.allowEval).onChange(async (v) => {
        s.remote.allowEval = v;
        await this.save(false);
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Board (sessions)").setHeading();
    new import_obsidian7.Setting(containerEl).setName("Daemon URL").setDesc("The sessions-daemon feeding the board. Tailnet-only.").addText(
      (t) => t.setPlaceholder("http://mac-mini.tail1fd1c8.ts.net:8091").setValue(s.board.daemonUrl).onChange(async (v) => {
        s.board.daemonUrl = v.trim();
        await this.save(false);
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Steer token").setDesc("Bearer for the daemon's steer endpoints. Only needed on a shell-less device.").addText((t) => {
      t.setValue(s.board.steerToken).onChange(async (v) => {
        s.board.steerToken = v.trim();
        await this.save(false);
      });
      t.inputEl.type = "password";
      t.inputEl.autocomplete = "off";
    });
    new import_obsidian7.Setting(containerEl).setName("Local fallback").setDesc("Run the zsh session engine directly when the daemon is unreachable (desktop only).").addToggle(
      (t) => t.setValue(s.board.localFallback).onChange(async (v) => {
        s.board.localFallback = v;
        await this.save(false);
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Force web terminal").setDesc("Use the browser terminal on this desktop too, to exercise the mobile path.").addToggle(
      (t) => t.setValue(s.board.forceWebTerm).onChange(async (v) => {
        s.board.forceWebTerm = v;
        await this.save(false);
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Force daemon steer").setDesc("Steer through the daemon on this desktop too, to exercise the mobile path.").addToggle(
      (t) => t.setValue(s.board.forceDaemonSteer).onChange(async (v) => {
        s.board.forceDaemonSteer = v;
        await this.save(false);
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Ask loop").setHeading();
    new import_obsidian7.Setting(containerEl).setName("Enable ask loop").setDesc("Poll po-broker for pending tap-cards and surface them.").addToggle(
      (t) => t.setValue(s.ask.askLoop).onChange(async (v) => {
        s.ask.askLoop = v;
        await this.save(false, true);
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Broker URL").setDesc("po-broker base, e.g. https://mac-mini.tail1fd1c8.ts.net:7890/po").addText(
      (t) => t.setPlaceholder("https://mac-mini.tail1fd1c8.ts.net:7890/po").setValue(s.ask.brokerUrl).onChange(async (v) => {
        s.ask.brokerUrl = v.trim();
        await this.save(false, true);
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Poll interval (ms)").setDesc("How often to poll GET /po/pending. Default 2000.").addText(
      (t) => t.setValue(String(s.ask.askPollMs)).onChange(async (v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 250) {
          s.ask.askPollMs = n;
          await this.save(false, true);
        }
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Terminal").setHeading();
    new import_obsidian7.Setting(containerEl).setName("WebSocket URL").setDesc("ttyd/websocket terminal front, e.g. wss://mac-mini.tail1fd1c8.ts.net:7890").addText(
      (t) => t.setPlaceholder("wss://mac-mini.tail1fd1c8.ts.net:7890").setValue(s.term.wsUrl).onChange(async (v) => {
        s.term.wsUrl = v.trim();
        await this.save(false);
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Session label").setDesc("tmux session the terminal attaches to (`tmux new -A -s <label>`).").addText(
      (t) => t.setValue(s.term.sessionLabel).onChange(async (v) => {
        s.term.sessionLabel = v.trim();
        await this.save(false);
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Auth token").setDesc("Bearer for the terminal websocket front.").addText((t) => {
      t.setValue(s.term.authToken).onChange(async (v) => {
        s.term.authToken = v.trim();
        await this.save(false);
      });
      t.inputEl.type = "password";
      t.inputEl.autocomplete = "off";
    });
    new import_obsidian7.Setting(containerEl).setName("Canvas renderer").setDesc("xterm.js canvas renderer. Leave OFF on broken-GPU boxes (webgl blanks the pane).").addToggle(
      (t) => t.setValue(s.term.useCanvasRenderer).onChange(async (v) => {
        s.term.useCanvasRenderer = v;
        await this.save(false);
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Show key bar").setDesc("On-screen key bar (iPad: Esc/Tab/Ctrl/arrows).").addToggle(
      (t) => t.setValue(s.term.showKeyBar).onChange(async (v) => {
        s.term.showKeyBar = v;
        await this.save(false);
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Copy on select").setDesc("Copy text to the clipboard the moment it is selected in the terminal.").addToggle(
      (t) => t.setValue(s.term.copyOnSelect).onChange(async (v) => {
        s.term.copyOnSelect = v;
        await this.save(false);
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Font size").setDesc("Terminal font size in px. Default 14.").addText(
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
var ASK_MODAL_TTL_MS = 12e4;
var LEGACY_PLUGIN_IDS = {
  remote: "deborah-remote",
  board: "session-modal",
  pocket: "pocketoracle"
};
var BOARD_REFRESH_MS = 3e4;
var JarvisBoardView = class extends import_obsidian8.ItemView {
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
      const r = await (0, import_obsidian8.requestUrl)({ url, method: "GET", throw: false });
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
        // Tapping a card opens the project DASHBOARD modal (the /ask ruling 2026-10-05),
        // NOT the raw CONTINUE.md — the note is now a secondary button inside the modal.
        onPick: (c) => {
          new DashboardModal(
            { app: this.plugin.app, getSettings: () => this.plugin.settings },
            c
          ).open();
        }
      });
    }
  }
};
var JarvisSurfacePlugin = class extends import_obsidian8.Plugin {
  settings = DEFAULT_SETTINGS;
  /** The tailnet remote-control channel (deborah-remote port). Null until gated on. */
  remote = null;
  /** The tap-don't-type ask-loop poller (pocketoracle port). Null until gated on. */
  ask = null;
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
    this.restartAsk();
  }
  onunload() {
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
   * (Re)start the ask-loop poller from the LIVE settings. Called on load and whenever
   * the settings tab changes an `ask.*` value. Starts a loop ONLY when the ask-loop is
   * enabled AND a broker URL is set; otherwise it tears the loop down and leaves it
   * dark. Mirrors restartRemote so a changed brokerUrl/cadence takes effect by
   * teardown-and-recreate rather than mutating a running poller.
   */
  restartAsk() {
    this.ask?.stop();
    this.ask = null;
    const a = this.settings.ask;
    if (!(a.askLoop && a.brokerUrl)) return;
    this.ask = new AskLoop(this.app, a.brokerUrl, {
      ttlMs: ASK_MODAL_TTL_MS,
      pollMs: a.askPollMs
    });
    this.ask.start();
  }
  /**
   * LiveSync replicates data.json across devices and will clobber it under a running
   * plugin. Obsidian calls this when the file changes on disk; re-migrate rather than
   * trust the in-memory copy, so a value another device wrote actually takes effect.
   */
  async onExternalSettingsChange() {
    this.settings = migrateSettings(await this.loadData());
    this.restartRemote();
    this.restartAsk();
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
