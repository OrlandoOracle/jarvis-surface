/**
 * The unified, versioned settings for the JARVIS surface.
 *
 * Three legacy plugins are being folded into one:
 *   - deborah-remote  -> `remote` (compiled-only; see src/remote/README.md)
 *   - session-modal   -> `board`
 *   - pocketoracle    -> `ask` (ask-loop) + `term` (terminal)
 *
 * Each shipped its OWN flat `data.json`. This module keeps the three concerns
 * namespaced so they can never clobber one another's keys, and carries a
 * `schemaVersion` so future shapes can migrate forward deterministically instead of
 * `Object.assign`-ing a guess over whatever happened to be on disk.
 *
 * LiveSync footgun (locked by the Phase-1 research): LiveSync replicates
 * `.obsidian/plugins/<id>/data.json` across devices and will clobber this file out
 * from under a running plugin. `migrateSettings` is therefore idempotent and
 * total — it must accept the plugin's own v1 shape, any one of the three legacy
 * flat shapes, a partial, or garbage, and always return a complete v1 object. The
 * plugin re-runs it from `onExternalSettingsChange()` on every external write.
 */

export const SCHEMA_VERSION = 1 as const;

/** deborah-remote (⚠ compiled-only source — values verified from main.js DEFAULTS). */
export interface RemoteSettings {
  /**
   * Command-channel base URL. The client hits `{baseUrl}/cmd/stream` (SSE) and
   * `{baseUrl}/cmd/ack` (POST). Tailnet-only, bearer-gated. Re-pointed off the dead
   * d2 `todaystream` (left the mesh 2026-09-28) to the Mini keystone `/jarvis` inbound.
   */
  baseUrl: string;
  /** Root key for the command channel. Device-local, never synced, never committed. */
  bearer: string;
  /** Hold the SSE command channel open and execute pushed ops. */
  remoteControl: boolean;
  /** Allow the `eval` op (arbitrary JS with full vault access). Off by default. */
  allowEval: boolean;
}

/** session-modal — the project/session cockpit board. */
export interface BoardSettings {
  /** Use the browser terminal on THIS desktop too, to exercise the mobile path. */
  forceWebTerm: boolean;
  /** The sessions-daemon on d2. Tailnet-only, unauthenticated by design. */
  daemonUrl: string;
  /** Desktop fallback: run the zsh engine directly when the daemon is unreachable. */
  localFallback: boolean;
  /** Bearer for the daemon's steering endpoints. Only needed on a shell-less device. */
  steerToken: string;
  /** Steer through the daemon on this desktop too, to exercise the mobile path. */
  forceDaemonSteer: boolean;
}

/** pocketoracle — the tap-don't-type ask-loop half. */
export interface AskSettings {
  /** Master switch for the ask-loop poller. */
  askLoop: boolean;
  /** po-broker base, e.g. https://mac-mini.tail1fd1c8.ts.net:7890/po. */
  brokerUrl: string;
  /** Poll cadence for GET /po/pending, ms. */
  askPollMs: number;
}

/** pocketoracle — the embedded terminal half. */
export interface TermSettings {
  /** ttyd/websocket terminal front, e.g. wss://…:7890. */
  wsUrl: string;
  /** tmux session label the terminal attaches to (`tmux new -A -s <label>`). */
  sessionLabel: string;
  /** Bearer for the terminal websocket front. */
  authToken: string;
  /** xterm.js canvas renderer vs. the DOM renderer (DOM on broken-GPU boxes). */
  useCanvasRenderer: boolean;
  fontSize: number;
  lineHeight: number;
  /** Show the on-screen key bar (iPad: Esc/Tab/Ctrl/arrows). */
  showKeyBar: boolean;
  /** Copy-on-select in the terminal. */
  copyOnSelect: boolean;
}

export interface JarvisSettings {
  schemaVersion: typeof SCHEMA_VERSION;
  remote: RemoteSettings;
  board: BoardSettings;
  ask: AskSettings;
  term: TermSettings;
}

export const DEFAULT_SETTINGS: JarvisSettings = {
  schemaVersion: SCHEMA_VERSION,
  remote: {
    // Re-pointed off the dead d2 `todaystream` to the Mini keystone `/jarvis` inbound
    // (d2 left the mesh 2026-09-28). The keystone serves /cmd/stream + /cmd/ack behind
    // `tailscale serve --set-path /jarvis`. No connection opens until a bearer is set
    // (device-local, never synced), so a fresh install still no-ops cleanly.
    baseUrl: "https://mac-mini.tail1fd1c8.ts.net/jarvis",
    bearer: "",
    remoteControl: true,
    allowEval: false,
  },
  board: {
    // Verified from obsidian-session-modal/src/settings.ts DEFAULT_SETTINGS.
    forceWebTerm: false,
    daemonUrl: "http://100.122.18.7:8091",
    localFallback: true,
    steerToken: "",
    forceDaemonSteer: false,
  },
  ask: {
    askLoop: true,
    brokerUrl: "",
    askPollMs: 2000,
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
    copyOnSelect: true,
  },
};

/** A loosely-typed bag, which is all a hand-edited / LiveSync-clobbered file is. */
type Bag = Record<string, unknown>;

function isObj(v: unknown): v is Bag {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Pull the four `remote` keys out of a flat deborah-remote data.json. */
function foldRemote(src: Bag, into: RemoteSettings): void {
  into.baseUrl = str(src.baseUrl, into.baseUrl);
  into.bearer = str(src.bearer, into.bearer);
  into.remoteControl = bool(src.remoteControl, into.remoteControl);
  into.allowEval = bool(src.allowEval, into.allowEval);
}

/** Pull the five `board` keys out of a flat session-modal data.json. */
function foldBoard(src: Bag, into: BoardSettings): void {
  into.forceWebTerm = bool(src.forceWebTerm, into.forceWebTerm);
  into.daemonUrl = str(src.daemonUrl, into.daemonUrl);
  into.localFallback = bool(src.localFallback, into.localFallback);
  into.steerToken = str(src.steerToken, into.steerToken);
  into.forceDaemonSteer = bool(src.forceDaemonSteer, into.forceDaemonSteer);
}

/** Split a flat pocketoracle data.json into the `ask` and `term` namespaces. */
function foldPocket(src: Bag, ask: AskSettings, term: TermSettings): void {
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

/** A fresh, deeply-cloned copy of the defaults — never alias the module constant. */
function freshDefaults(): JarvisSettings {
  const d = DEFAULT_SETTINGS;
  return {
    schemaVersion: SCHEMA_VERSION,
    remote: { ...d.remote },
    board: { ...d.board },
    ask: { ...d.ask },
    term: { ...d.term },
  };
}

/**
 * Total, idempotent migration from whatever is on disk to a complete v1 object.
 *
 *   - `null` / non-object  -> defaults (first run, or a truncated write).
 *   - already v1           -> defaults deep-merged with the stored namespaces.
 *   - a legacy flat shape  -> whichever legacy keys are present are folded into
 *                             their namespace; the rest take defaults.
 *
 * Legacy shapes are detected by key presence, not by a marker, because none of the
 * three ever wrote one. A single data.json only ever holds ONE plugin's keys, but
 * folding all three is harmless and keeps the function order-independent — which is
 * what lets `seedFromLegacy` pass three separate files through it.
 */
export function migrateSettings(raw: unknown): JarvisSettings {
  const out = freshDefaults();
  if (!isObj(raw)) return out;

  // Already the unified shape: merge stored namespaces over the defaults so a key
  // added in a later build still gets its default rather than becoming undefined.
  if (raw.schemaVersion === SCHEMA_VERSION) {
    if (isObj(raw.remote)) foldRemote(raw.remote, out.remote);
    if (isObj(raw.board)) foldBoard(raw.board, out.board);
    // In v1 `ask` carries only ask-keys and `term` only term-keys; foldPocket reads
    // whichever keys each object happens to hold, so passing both is correct.
    if (isObj(raw.ask)) foldPocket(raw.ask, out.ask, out.term);
    if (isObj(raw.term)) foldPocket(raw.term, out.ask, out.term);
    return out;
  }

  // Legacy flat shape (schemaVersion absent). Fold every legacy key we recognise;
  // folding all three is order-independent and only touches keys that are present.
  foldRemote(raw, out.remote);
  foldBoard(raw, out.board);
  foldPocket(raw, out.ask, out.term);
  return out;
}

/**
 * One-time seed from the three legacy plugins' `data.json` contents, for the cutover
 * where all three were installed. Each argument is the parsed JSON of one legacy
 * file (or `null` if that plugin was never installed on this device). The caller
 * reads the files; this stays pure so it can be unit-tested without a vault.
 */
export function seedFromLegacy(
  remoteData: unknown,
  boardData: unknown,
  pocketData: unknown,
): JarvisSettings {
  const out = freshDefaults();
  if (isObj(remoteData)) foldRemote(remoteData, out.remote);
  if (isObj(boardData)) foldBoard(boardData, out.board);
  if (isObj(pocketData)) foldPocket(pocketData, out.ask, out.term);
  return out;
}
