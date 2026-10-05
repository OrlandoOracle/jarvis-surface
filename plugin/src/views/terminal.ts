import { ItemView, Notice, Platform, type WorkspaceLeaf } from "obsidian";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import xtermCss from "@xterm/xterm/css/xterm.css";
import { TtydClient } from "./ttyd-client";
import { registerDisplayControl } from "./display-control";
import type { TermSettings } from "../state/settings";

export const VIEW_TYPE_TERMINAL = "jarvis-terminal";

// Injected once (not per-view) so multiple terminal panes share one <style>.
let xtermCssInjected = false;
export function ensureXtermCss(): void {
  if (xtermCssInjected) return;
  const style = document.createElement("style");
  style.id = "jarvis-xterm-css";
  style.textContent = xtermCss as unknown as string;
  document.head.appendChild(style);
  xtermCssInjected = true;
}

/**
 * Oracle-dark palette. Deliberately close to the vault's AnuPpuccin-Oracle dark
 * brand so the terminal reads as part of the same surface, not a stock xterm.
 * Tuned for higher contrast so text pops from across the desk without losing the
 * purple identity (8-Q iPad look/feel pass, carried over from pocketoracle).
 */
const ORACLE_THEME = {
  background: "#120e19",
  foreground: "#f4f1fb",
  cursor: "#c8a2ff",
  cursorAccent: "#120e19",
  selectionBackground: "#42346a",
  black: "#2a2140",
  red: "#ff7d99",
  green: "#9ce6ad",
  yellow: "#f2d59a",
  blue: "#9cc0ff",
  magenta: "#d3b0ff",
  cyan: "#93e2ec",
  white: "#e8e3f2",
  brightBlack: "#6b6090",
  brightRed: "#ff97b1",
  brightGreen: "#b6f0c4",
  brightYellow: "#f9e3b2",
  brightBlue: "#bcd4ff",
  brightMagenta: "#e3c8ff",
  brightCyan: "#aef0f7",
  brightWhite: "#ffffff",
};

/** Reconnect backoff: start fast, back off to a cap, reset on a clean open. */
const RECONNECT_FLOOR_MS = 1000;
const RECONNECT_CAP_MS = 15000;
/** Liveness watchdog cadence — probe the socket and check it's really draining. */
const HEARTBEAT_MS = 12000;

/** The minimal touch row: keys the iPad Magic Keyboard lacks (Esc) + fast nav/interrupt. */
const KEY_BAR: ReadonlyArray<{ label: string; seq: string }> = [
  { label: "Esc", seq: "\x1b" },
  { label: "^C", seq: "\x03" },
  { label: "Tab", seq: "\t" },
  { label: "↑", seq: "\x1b[A" },
  { label: "↓", seq: "\x1b[B" },
];

/**
 * In-plugin ttyd terminal — the Phase-1 #2 unit that replaces the browser-tab
 * "open terminal" stub the dashboard shipped with. A full xterm.js pane speaking
 * the raw ttyd WS protocol, so the session lives inside Obsidian on whatever
 * device has the pane open (iPad / iPhone / Mac) — the only transport that keeps
 * the terminal ours (theme it, drive it, read OSC off it).
 *
 * Attaches to the configured ttyd front (`term.wsUrl`), which serves one fixed
 * tmux session. Per-project pane passthrough (one ttyd per `p/<slug>`) is a
 * follow-on; this unit is the port + the dashboard rewire.
 */
export class JarvisTerminalView extends ItemView {
  private term: Terminal | null = null;
  private fit: FitAddon | null = null;
  private client: TtydClient | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private reconnectTimer: number | null = null;
  private resizeDebounce: number | null = null;
  private keyBarEl: HTMLElement | null = null;
  private disposed = false;

  // ── P0 reliability floor: keep the pane live, never blank, never stale ──────
  private backoffMs = RECONNECT_FLOOR_MS;
  private heartbeatTimer: number | null = null;
  private lastBuffered = 0;

  private getTerm: () => TermSettings;

  constructor(leaf: WorkspaceLeaf, getTerm: () => TermSettings) {
    super(leaf);
    // Constructor-assigned, not a class-field initializer: esbuild (es2018) emits
    // native fields the iOS Obsidian WebView can skip on a view subclass.
    this.getTerm = getTerm;
  }

  getViewType(): string {
    return VIEW_TYPE_TERMINAL;
  }

  getDisplayText(): string {
    return `JARVIS · ${this.getTerm().sessionLabel || "terminal"}`;
  }

  override getIcon(): string {
    return "square-terminal";
  }

  override async onOpen(): Promise<void> {
    ensureXtermCss();
    const root = this.contentEl;
    root.empty();
    root.addClass("jarvis-term-view");

    const s = this.getTerm();

    // Not configured yet — say so in the pane rather than spin forever.
    if (!s.wsUrl.trim()) {
      root.createDiv({
        cls: "jarvis-term-msg",
        text: "Set the ttyd websocket URL (wss://<host>:7890/ws) in Settings → JARVIS Surface → Terminal, then reopen this pane.",
      });
      return;
    }

    // Mixed-content guard: capacitor (mobile) is a secure origin and silently
    // drops ws://. Say it in the pane instead of opening a terminal that never
    // connects — the blank-pane failure this project keeps hunting.
    if (!Platform.isDesktopApp && s.wsUrl.startsWith("ws://")) {
      root.createDiv({
        cls: "jarvis-term-msg",
        text: "This device needs a wss:// URL — a plain ws:// gateway is blocked as mixed content here. Set the Caddy wss URL in JARVIS Surface terminal settings.",
      });
      return;
    }

    const host = root.createDiv({ cls: "jarvis-term-host" });

    const term = new Terminal({
      // System monospace stack — jarvis ships no bundled font (pocketoracle's
      // JetBrains Mono PO dependency dropped on port). The DOM renderer measures
      // the first available family, so no fonts.load() pre-measure is needed.
      fontFamily: "'SFMono-Regular', Menlo, Monaco, 'Courier New', monospace",
      fontSize: s.fontSize,
      lineHeight: s.lineHeight,
      cursorBlink: true,
      // 10k, not 100k: xterm cells are ~12 bytes so 100k is ~100MB+ on an iPad,
      // and tmux keeps the real history anyway.
      scrollback: 10000,
      // No webgl/canvas addon on purpose: the DOM renderer is the one that
      // survives GPU-broken boxes (reference-obsidian-terminal-blank-pane-renderer).
      theme: ORACLE_THEME,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(host);
    fit.fit();
    this.term = term;
    this.fit = fit;

    // Shift+Enter = insert a newline instead of submitting. xterm sends CR ("\r")
    // for Enter regardless of shift, and Claude Code's TUI reads a bare CR as
    // "submit"; a bare LF ("\n") is inserted as a newline. Returning false stops
    // xterm from also emitting the default CR.
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type === "keydown" && ev.key === "Enter" && ev.shiftKey) {
        ev.preventDefault();
        this.client?.sendInput("\n");
        return false;
      }
      return true;
    });

    // Copy-on-select: the iPad has no highlight-to-copy, so mirror the desktop
    // behaviour by writing the selection to the device clipboard on pointerup.
    host.addEventListener("pointerup", () => {
      if (!this.getTerm().copyOnSelect) return;
      const sel = term.getSelection();
      if (sel) void this.copySelection(sel);
    });

    // Minimal touch key row (Esc etc.) — the keys the iPad Magic Keyboard lacks.
    if (s.showKeyBar) this.buildKeyBar(root);

    // Let the far shell drive THIS device's Obsidian appearance via OSC 5379.
    registerDisplayControl(term, this.app);

    this.connect();

    // Keep the far pty sized to the pane.
    this.resizeObserver = new ResizeObserver(() => this.refit());
    this.resizeObserver.observe(host);

    // iOS soft-keyboard fit: the layout viewport does NOT shrink on iOS when the
    // on-screen keyboard opens, so the ResizeObserver can miss it. visualViewport
    // fires on keyboard open/close — refit off it so the terminal fills the space
    // actually above the keyboard.
    const vv = window.visualViewport;
    if (vv) {
      this.registerDomEvent(vv as unknown as HTMLElement, "resize", () => this.refit());
      this.registerDomEvent(vv as unknown as HTMLElement, "scroll", () => this.refit());
    }

    // ── Reliability floor ────────────────────────────────────────────────────
    // The #1 trust-killer is "blank when I come back": iOS freezes/kills the WS
    // while Obsidian is backgrounded, and on return a zombie socket can leave the
    // pane blank. Forcing a reconnect the instant the pane becomes visible
    // recovers the socket AND pulls a fresh tmux redraw.
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") this.forceReconnect();
    });
    // A network flap (Wi-Fi ↔ cellular, tunnel re-up) — reconnect on return.
    this.registerDomEvent(window, "online", () => this.forceReconnect());

    // Watchdog for the foreground case: a socket that goes dead without firing
    // onclose (readyState stuck, or bytes that never flush).
    this.heartbeatTimer = window.setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  }

  /** Tear down and reconnect immediately, resetting the backoff. */
  private forceReconnect(): void {
    if (this.disposed || !this.term) return;
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.backoffMs = RECONNECT_FLOOR_MS;
    this.client?.close();
    this.client = null;
    this.connect();
  }

  /** Liveness probe. Skips while hidden (visibilitychange handles the return). */
  private heartbeat(): void {
    if (this.disposed || document.visibilityState !== "visible") return;
    const client = this.client;
    if (!client) return;
    // Only reconnect a socket that is actually dead. CONNECTING means a reconnect
    // is already in flight — tearing it down here restarts the handshake every
    // 12s (a slow-gateway loop), so give it time to open.
    if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
      this.forceReconnect();
      return;
    }
    if (client.readyState !== WebSocket.OPEN) return; // CONNECTING — wait it out
    const buffered = client.bufferedAmount;
    if (buffered > 0 && this.lastBuffered > 0 && buffered >= this.lastBuffered) {
      // Bytes queued two heartbeats running and not draining → dead TCP.
      this.lastBuffered = 0;
      this.forceReconnect();
      return;
    }
    this.lastBuffered = buffered;
    if (this.term) client.probe(this.term.cols, this.term.rows);
  }

  /** Write the terminal selection to the device clipboard, with a legacy fallback. */
  private async copySelection(text: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
      /* fall through to the execCommand path below */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    } catch {
      /* clipboard unavailable — nothing more to do */
    }
  }

  /** Slim on-screen row that injects the keys a hardware iPad keyboard can't. */
  private buildKeyBar(root: HTMLElement): void {
    const bar = root.createDiv({ cls: "jarvis-term-keybar" });
    for (const key of KEY_BAR) {
      const btn = bar.createEl("button", {
        cls: "jarvis-term-key",
        text: key.label,
      });
      // pointerdown, not click: keep terminal focus, fire before the tap steals it.
      btn.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        this.client?.sendInput(key.seq);
        this.term?.focus();
      });
    }
    this.keyBarEl = bar;
  }

  /** Obsidian's own resize lifecycle hook — also drives the refit. */
  override onResize(): void {
    this.refit();
  }

  private connect(): void {
    if (this.disposed || !this.term) return;
    const term = this.term;
    const s = this.getTerm();

    const client = new TtydClient(s.wsUrl, s.authToken, {
      onOutput: (bytes) => term.write(bytes),
      onTitle: () => {
        /* leaf title is our own "JARVIS · <label>"; ignore ttyd's OSC title */
      },
      onOpen: () => {
        this.backoffMs = RECONNECT_FLOOR_MS;
        this.lastBuffered = 0;
        this.refit();
      },
      onClose: (ev) => {
        if (this.disposed) return;
        term.writeln(
          `\r\n\x1b[38;5;140m[jarvis] disconnected (${ev.code}) — reconnecting…\x1b[0m`,
        );
        this.scheduleReconnect();
      },
      onError: () => {
        if (this.disposed) return;
        term.writeln("\r\n\x1b[38;5;203m[jarvis] websocket error\x1b[0m");
      },
    });

    term.onData((d) => client.sendInput(d));
    term.onResize(({ cols, rows }) => client.sendResize(cols, rows));

    client.connect(term.cols, term.rows);
    this.client = client;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer != null) return;
    // Exponential backoff with a cap + jitter so a long outage doesn't hammer the
    // gateway, but a brief flap still recovers in ~1s.
    const delay = this.backoffMs + Math.floor(Math.random() * 300);
    this.backoffMs = Math.min(this.backoffMs * 2, RECONNECT_CAP_MS);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.client?.close();
      this.client = null;
      this.connect();
    }, delay);
  }

  private refit(): void {
    if (this.resizeDebounce != null) window.clearTimeout(this.resizeDebounce);
    this.resizeDebounce = window.setTimeout(() => {
      this.resizeDebounce = null;
      try {
        this.fit?.fit();
        this.term?.scrollToBottom();
      } catch {
        /* pane not laid out yet */
      }
    }, 80);
  }

  /** Re-read live settings into an already-open pane (settings tab / LiveSync). */
  settingsChanged(): void {
    const s = this.getTerm();
    if (this.term) {
      this.term.options.fontSize = s.fontSize;
      this.term.options.lineHeight = s.lineHeight;
      const root = this.contentEl;
      if (s.showKeyBar && !this.keyBarEl) {
        this.buildKeyBar(root);
      } else if (!s.showKeyBar && this.keyBarEl) {
        this.keyBarEl.remove();
        this.keyBarEl = null;
      }
      this.fit?.fit();
    }
  }

  /** Write text into the far session (used by the command palette / workflows). */
  sendText(text: string): void {
    if (!this.client?.isOpen) {
      new Notice("JARVIS: terminal not connected");
      return;
    }
    this.client.sendInput(text);
  }

  override async onClose(): Promise<void> {
    this.disposed = true;
    if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer != null) window.clearInterval(this.heartbeatTimer);
    if (this.resizeDebounce != null) window.clearTimeout(this.resizeDebounce);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.keyBarEl = null;
    this.client?.close();
    this.client = null;
    this.term?.dispose();
    this.term = null;
  }
}
