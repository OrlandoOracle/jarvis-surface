// The per-project dashboard — what a board card opens when tapped (the card-tap used to
// open CONTINUE.md raw; this replaces it, per the 2026-10-05 /ask ruling). A MODAL over
// the board, one shared layout auto-rendered from the daemon card + CONTINUE.md, with an
// optional per-project `dashboard.yaml` adding panels. It is the DO surface: the status
// headline, the directions/next/gates from the ledger, and the four live controls —
// resume (open terminal), steer (type a line), approve/reject (answer the pane's menu),
// interrupt. Live + auto-refreshing while open; a running/idle badge is the only thing
// that changes between states (one layout, not two).
//
// Everything it fetches goes over the keystone HTTPS front (`board.daemonUrl`), never a
// raw tailnet-IP:port — iOS ATS blocks cleartext, and the steer client proves the rule.
// CONTINUE.md is read with `vault.adapter.read`, the one file path that works on iOS.

import { App, Modal, Notice, Platform, parseYaml, requestUrl } from "obsidian";
import type { ProjectCard, ProjectsPayload } from "./types";
import { LIVE_DOT } from "./types";
import type { JarvisSettings } from "../state/settings";
import { EMPTY_CONTINUE, parseContinue, type ParsedContinue } from "./continue-doc";
import { SteerClient } from "./steer";

export interface DashboardDeps {
  app: App;
  /** Read LIVE — settings are replaced wholesale on a LiveSync write. */
  getSettings: () => JarvisSettings;
}

/** One extra panel from a project's `dashboard.yaml`. */
interface OverridePanel {
  title: string;
  /** Vault-relative note whose first chunk is shown. */
  note?: string;
  /** Inline text shown verbatim. */
  text?: string;
}

const REFRESH_MS = 5000;
/** How much of an override `note:` to show — a panel is a peek, not the whole file. */
const NOTE_PEEK = 600;

function trimBase(u: string): string {
  return (u || "").replace(/\/+$/, "");
}

export class DashboardModal extends Modal {
  // Constructor-assigned, NOT class-field initializers: esbuild (es2018) emits native
  // class fields that the iOS Obsidian WebView does not run on a Modal subclass, which
  // left AskModal blank on the iPad. Assign in the constructor body so it always runs.
  private deps: DashboardDeps;
  private card: ProjectCard;
  private doc: ParsedContinue;
  private panels: OverridePanel[];
  private timer: number | null;
  /** The menu the pane is currently asking, when the approve/reject panel is open. */
  private menuOpen: boolean;

  constructor(deps: DashboardDeps, card: ProjectCard) {
    super(deps.app);
    this.deps = deps;
    this.card = card;
    this.doc = { ...EMPTY_CONTINUE };
    this.panels = [];
    this.timer = null;
    this.menuOpen = false;
  }

  private get slug(): string {
    return this.card.slug;
  }

  private steer(): SteerClient {
    const s = this.deps.getSettings();
    // The steer client authenticates to the keystone with the CMD bearer (remote.bearer),
    // NOT the raw daemon token — the keystone injects the daemon token server-side. This
    // is what lets the iPad/phone steer with only the keystone key they already hold.
    return new SteerClient(s.board.daemonUrl, s.remote.bearer);
  }

  override onOpen(): void {
    this.modalEl.addClass("jarvis-dash");
    this.draw();
    // Kick the async loads; each redraws when it lands so the modal paints immediately
    // with the card data we already have and fills in as the slower reads return.
    void this.loadDoc();
    void this.loadPanels();
    void this.refreshCard();
    this.timer = window.setInterval(() => void this.refreshCard(), REFRESH_MS);
  }

  override onClose(): void {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
    this.contentEl.empty();
  }

  // --- async loads -------------------------------------------------------------

  /** Read + parse this project's CONTINUE.md off the vault adapter (iOS-safe). A project
   *  that lives in another vault (e.g. ~/PersonalVault) or has no CONTINUE.md simply
   *  leaves `doc` empty and the modal falls back to the daemon card. */
  private async loadDoc(): Promise<void> {
    const path = `01-Projects/${this.slug}/CONTINUE.md`;
    try {
      const adapter = this.deps.app.vault.adapter;
      if (!(await adapter.exists(path))) return;
      this.doc = parseContinue(await adapter.read(path));
      this.draw();
    } catch {
      /* unreadable → keep the empty doc, card data still renders */
    }
  }

  /** Read an optional `dashboard.yaml` for extra panels (the "shared + overrides" ruling).
   *  Absent / malformed → no panels, never an error. */
  private async loadPanels(): Promise<void> {
    const path = `01-Projects/${this.slug}/dashboard.yaml`;
    try {
      const adapter = this.deps.app.vault.adapter;
      if (!(await adapter.exists(path))) return;
      const parsed = parseYaml(await adapter.read(path)) as { panels?: unknown };
      if (parsed && Array.isArray(parsed.panels)) {
        this.panels = parsed.panels
          .filter((p): p is OverridePanel => !!p && typeof (p as OverridePanel).title === "string")
          .map((p) => ({ title: p.title, note: p.note, text: p.text }));
        this.draw();
      }
    } catch {
      /* malformed yaml → no panels */
    }
  }

  /** Re-pull the ranked feed and refresh THIS card (badge/status/next go live). Quiet on
   *  failure — a transient daemon blip must not blank a modal the user is reading. */
  private async refreshCard(): Promise<void> {
    const base = trimBase(this.deps.getSettings().board.daemonUrl);
    if (!base) return;
    try {
      const r = await requestUrl({ url: base + "/projects", method: "GET", throw: false });
      if (r.status !== 200) return;
      const payload = (r.json ?? JSON.parse(r.text)) as ProjectsPayload;
      const fresh = (payload.projects ?? []).find((c) => c.slug === this.slug);
      if (fresh) {
        this.card = fresh;
        this.draw();
      }
    } catch {
      /* transient — next tick retries */
    }
  }

  // --- render ------------------------------------------------------------------

  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("jarvis-dash-content");

    const live = this.card.live ?? null;

    // Header: slug + a run-state badge. One layout; only the badge flips (the /ask ruling).
    const head = contentEl.createDiv({ cls: "jarvis-dash-head" });
    head.createEl("div", { cls: "jarvis-dash-brand", text: "◆ JARVIS · project" });
    const titleRow = head.createDiv({ cls: "jarvis-dash-titlerow" });
    titleRow.createEl("div", { cls: "jarvis-dash-title", text: this.slug });
    const badge = titleRow.createDiv({ cls: "jarvis-dash-badge" });
    if (live) {
      badge.createSpan({ cls: `cockpit-dot cockpit-dot--${live.status}`, text: LIVE_DOT[live.status] });
      badge.createSpan({ cls: "jarvis-dash-state", text: live.status });
      if (live.host_key) badge.createSpan({ cls: "jarvis-dash-host", text: live.host_key });
      if (!live.injectable) badge.createSpan({ cls: "jarvis-dash-monitor", text: "monitor-only" });
    } else if (this.card.session) {
      badge.createSpan({ cls: "cockpit-dot cockpit-dot--unknown", text: "◍" });
      badge.createSpan({ cls: "jarvis-dash-state", text: "up, no beacon" });
    } else {
      badge.createSpan({ cls: "cockpit-dot cockpit-dot--cold", text: "○" });
      badge.createSpan({ cls: "jarvis-dash-state", text: "idle" });
    }

    // Status + NEXT headline — daemon card merged with CONTINUE.md (the ledger is richer
    // when present, but the card's status always exists even for an off-vault project).
    const status = this.doc.status || this.card.status || "—";
    contentEl.createDiv({ cls: "jarvis-dash-status", text: status });
    const nextText = this.card.next || this.doc.next[0] || "";
    contentEl.createDiv({ cls: "jarvis-dash-next" }).createSpan({
      cls: nextText ? "jarvis-dash-next-text" : "jarvis-dash-next-text jarvis-dash-next-text--none",
      text: nextText ? `NEXT → ${nextText}` : "NEXT → —",
    });

    // Controls — the DO surface.
    this.drawControls(contentEl, live);

    // Ledger detail from CONTINUE.md (collapsed-ish sections; only shown when present).
    if (this.doc.decided.length) this.drawList(contentEl, "Decided", this.doc.decided.slice(-6));
    if (this.doc.gates.length) this.drawList(contentEl, "Gates", this.doc.gates.slice(0, 6));
    if (this.doc.next.length > 1) this.drawList(contentEl, "Next", this.doc.next.slice(0, 6));

    // Override panels from dashboard.yaml.
    for (const p of this.panels) this.drawPanel(contentEl, p);

    // Secondary: the raw CONTINUE.md is one tap away (it is no longer the primary action).
    const foot = contentEl.createDiv({ cls: "jarvis-dash-foot" });
    const openNote = foot.createEl("button", { cls: "jarvis-dash-btn jarvis-dash-btn--ghost", text: "open CONTINUE.md" });
    openNote.addEventListener("click", () => {
      void this.deps.app.workspace.openLinkText(`01-Projects/${this.slug}/CONTINUE.md`, "", false);
      this.close();
    });
  }

  private drawControls(parent: HTMLElement, live: ProjectCard["live"]): void {
    const injectable = !!live?.injectable;
    // The daemon's steering resolves a host KEY ("mini"/"mac"/"d1"/"d2"), not the raw
    // `socket.gethostname()` — passing `live.host` ("Sebastians-Mac-mini.local") makes it
    // treat the local pane as an unknown/remote host and try (and fail) to ssh. `host_key`
    // is the field for this; fall back to the raw host only if the daemon didn't supply it.
    const host = live?.host_key ?? live?.host ?? "";
    const pane = live?.pane ?? "";

    const wrap = parent.createDiv({ cls: "jarvis-dash-controls" });

    // Resume / open terminal — the spawn path is the terminal (tmux new -A -s p/<slug>);
    // the ttyd term view is a follow-on unit, so this opens the terminal front in a
    // browser tab when configured, and says so honestly when it is not.
    const resume = wrap.createEl("button", { cls: "jarvis-dash-btn jarvis-dash-btn--primary" });
    resume.setText(live ? "open terminal ⧉" : "resume / open terminal ⧉");
    resume.addEventListener("click", () => this.openTerminal());

    // Interrupt (ESC) — only where there is a pane to send to.
    const esc = wrap.createEl("button", { cls: "jarvis-dash-btn", text: "interrupt ⎋" });
    esc.disabled = !injectable;
    esc.addEventListener("click", () => void this.doInterrupt(host, pane, esc));

    // Approve / reject — read the pane's current menu, then render its options as taps.
    const approve = wrap.createEl("button", { cls: "jarvis-dash-btn", text: "answer prompt ▸" });
    approve.disabled = !injectable;
    approve.addEventListener("click", () => void this.toggleMenu(host, pane, parent));

    // Steer — type one line into the pane.
    const steerRow = parent.createDiv({ cls: "jarvis-dash-steerrow" });
    const input = steerRow.createEl("input", {
      cls: "jarvis-dash-steerinput",
      attr: { type: "text", placeholder: injectable ? "Steer: type a line…" : "No live pane to steer" },
    });
    input.disabled = !injectable;
    const send = steerRow.createEl("button", { cls: "jarvis-dash-btn jarvis-dash-btn--primary", text: "send" });
    send.disabled = !injectable;
    const fire = (): void => {
      const text = input.value.trim();
      if (!text) return;
      void this.doSay(host, pane, text, send, input);
    };
    send.addEventListener("click", fire);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") fire();
    });

    // When the approve panel is toggled on, render it under the controls.
    if (this.menuOpen) this.drawMenuPanel(parent, host, pane);
  }

  private openTerminal(): void {
    const term = this.deps.getSettings().term;
    if (!term.wsUrl) {
      new Notice("Terminal not configured (Settings → JARVIS Surface → Terminal). The ttyd view is a follow-on unit.");
      return;
    }
    // wss://host:7890/… → https://host:7890/ ; the browser terminal front lives at the
    // same host. Opening in a new tab is honest until the in-plugin term view lands.
    let httpUrl = term.wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    try {
      const u = new URL(httpUrl);
      httpUrl = `${u.protocol}//${u.host}/`;
    } catch {
      /* leave as-is */
    }
    if (Platform.isMobile) {
      new Notice(`Terminal: ${httpUrl} (in-plugin term view is a follow-on unit)`);
    } else {
      window.open(httpUrl, "_blank");
    }
  }

  private async doInterrupt(host: string, pane: string, btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true;
    const r = await this.steer().interrupt(host, pane);
    this.reportSteer(r, "Interrupt sent");
    btn.disabled = false;
  }

  private async doSay(
    host: string,
    pane: string,
    text: string,
    btn: HTMLButtonElement,
    input: HTMLInputElement,
  ): Promise<void> {
    btn.disabled = true;
    const r = await this.steer().say(host, pane, text);
    this.reportSteer(r, `Sent: ${text}`);
    if (r.kind === "ok") input.value = "";
    btn.disabled = false;
  }

  private toggleMenu(host: string, pane: string, parent: HTMLElement): void {
    this.menuOpen = !this.menuOpen;
    this.draw();
  }

  /** Render the pane's current menu as tap-to-choose options (approve/reject = pick N). */
  private async drawMenuPanel(parent: HTMLElement, host: string, pane: string): Promise<void> {
    const box = parent.createDiv({ cls: "jarvis-dash-menu" });
    box.createEl("div", { cls: "jarvis-dash-menu-load", text: "Reading the prompt…" });
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

  private async doChoose(
    host: string,
    pane: string,
    option: number,
    expect: string,
    btn: HTMLButtonElement,
  ): Promise<void> {
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

  private reportSteer(r: { kind: string; detail?: string; error?: string }, okMsg: string): void {
    if (r.kind === "ok") new Notice(okMsg);
    else if (r.kind === "refused") new Notice(`Refused: ${r.error}`);
    else new Notice(`Steer failed: ${r.error}`);
  }

  private drawList(parent: HTMLElement, title: string, items: string[]): void {
    const sec = parent.createDiv({ cls: "jarvis-dash-sec" });
    sec.createEl("div", { cls: "jarvis-dash-sec-title", text: title });
    const ul = sec.createEl("ul", { cls: "jarvis-dash-sec-list" });
    for (const it of items) ul.createEl("li", { text: it });
  }

  private async drawPanel(parent: HTMLElement, p: OverridePanel): Promise<void> {
    const sec = parent.createDiv({ cls: "jarvis-dash-sec jarvis-dash-sec--panel" });
    sec.createEl("div", { cls: "jarvis-dash-sec-title", text: p.title });
    if (p.text) {
      sec.createEl("div", { cls: "jarvis-dash-panel-text", text: p.text });
      return;
    }
    if (p.note) {
      const body = sec.createEl("div", { cls: "jarvis-dash-panel-text", text: "…" });
      try {
        const adapter = this.deps.app.vault.adapter;
        if (await adapter.exists(p.note)) {
          const raw = await adapter.read(p.note);
          body.setText(raw.slice(0, NOTE_PEEK) + (raw.length > NOTE_PEEK ? "…" : ""));
        } else {
          body.setText(`(missing: ${p.note})`);
        }
      } catch {
        body.setText(`(unreadable: ${p.note})`);
      }
    }
  }
}
