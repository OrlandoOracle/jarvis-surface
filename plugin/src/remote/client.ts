// Reverse-engineered from obsidian-deborah-remote/main.js (2026-08-30) — the SSE
// connect/reconnect half of the remote-control channel (connectCmd / disconnectCmd /
// scheduleCmdRetry / ack in the original). No .ts source ever existed.
//
// Transport mechanism only: the endpoint is driven ENTIRELY by RemoteSettings.baseUrl.
// The legacy default pointed at d2's `todaystream`; d2 left the mesh 2026-09-28, so
// NO literal endpoint lives here — re-pointing the channel (to the Mini keystone /
// local-rest-api inbound) is a separate follow-on unit. With no baseUrl (or no
// bearer) connect() no-ops cleanly: it does not throw and does not schedule a retry,
// because there is nothing to reconnect to and a timer would be a busy loop.
//
// Security: tailnet-only, bearer-gated. The bearer is a ROOT key (arbitrary JS + full
// vault access via the dispatcher) — it lives device-local in data.json, is never
// synced and never committed (RemoteSettings owns it). No live socket is opened at
// build/test time; start() is only ever called from the plugin's onload gate.

import { Platform, requestUrl } from "obsidian";
import type { RemoteSettings } from "../state/settings";
import { RemoteDispatcher, type RemoteCommand } from "./dispatcher";
import type { App, Plugin } from "obsidian";

function trimBase(u: string): string {
  return (u || "").replace(/\/+$/, "");
}

// Per-DEVICE label so an ack can say which surface ran a fanned-out push. The
// original persisted this in data.json; the unified RemoteSettings has no field for
// it (and must not grow one here), so it is generated once per client instance and
// kept in memory — stable for the session, which is all the ack label needs.
function genClientId(): string {
  const P = Platform;
  const kind = P.isIosApp
    ? "ios"
    : P.isAndroidApp
      ? "android"
      : P.isMacOS
        ? "mac"
        : P.isWin
          ? "win"
          : P.isLinux
            ? "linux"
            : P.isMobile
              ? "mobile"
              : "desktop";
  let rand = "";
  try {
    const b = new Uint8Array(2);
    crypto.getRandomValues(b);
    rand = Array.from(b)
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    rand = Math.floor(Math.random() * 65536)
      .toString(16)
      .padStart(4, "0");
  }
  return kind + "-" + rand;
}

const RETRY_MS = 4000;

export interface RemoteClientDeps {
  app: App;
  plugin: Plugin;
  /** Read LIVE — settings are replaced wholesale on an external (LiveSync) write. */
  getSettings: () => RemoteSettings;
  /** Optional handler for the `openstream` op (the stream view is a follow-on unit). */
  openStream?: () => Promise<void> | void;
}

export class RemoteClient {
  private es: EventSource | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private readonly clientId: string;
  private readonly dispatcher: RemoteDispatcher;

  constructor(private readonly deps: RemoteClientDeps) {
    this.clientId = genClientId();
    // The client owns the dispatcher so the ack path and the socket stay colocated;
    // the dispatcher calls back into this.ack with each op's result.
    this.dispatcher = new RemoteDispatcher({
      app: deps.app,
      plugin: deps.plugin,
      allowEval: () => deps.getSettings().allowEval,
      ack: (id, ok, result) => this.ack(id, ok, result),
      openStream: deps.openStream,
    });
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.disconnect();
  }

  private connect(): void {
    this.disconnect();
    if (this.stopped) return;
    const s = this.deps.getSettings();
    const base = trimBase(s.baseUrl);
    const bearer = s.bearer;
    // No endpoint or no key => clean no-op. Deliberately NO scheduleRetry(): there is
    // nothing to reconnect to, and retrying would spin a timer forever.
    if (!base || !bearer) return;
    const url =
      base +
      "/cmd/stream?bearer=" +
      encodeURIComponent(bearer) +
      "&client=" +
      encodeURIComponent(this.clientId);
    try {
      this.es = new EventSource(url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.es.onmessage = (e: MessageEvent) => {
      let cmd: RemoteCommand;
      try {
        cmd = JSON.parse(e.data as string) as RemoteCommand;
      } catch {
        return;
      }
      void this.dispatcher.execute(cmd);
    };
    // EventSource auto-reconnects on a dropped socket; the guard is here so a thrown
    // handler can never leave the error path unhandled.
    this.es.onerror = () => {
      /* EventSource auto-reconnects; nothing to do */
    };
  }

  private disconnect(): void {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    if (this.retry) {
      clearTimeout(this.retry);
      this.retry = null;
    }
  }

  private scheduleRetry(): void {
    if (this.retry || this.stopped) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, RETRY_MS);
  }

  /** POST a pushed op's result back to `/cmd/ack`. Best-effort: a failed ack is ignored. */
  async ack(id: RemoteCommand["id"], ok: boolean, result?: unknown): Promise<void> {
    if (id == null) return;
    const s = this.deps.getSettings();
    const base = trimBase(s.baseUrl);
    if (!base || !s.bearer) return;
    try {
      await requestUrl({
        url: base + "/cmd/ack?bearer=" + encodeURIComponent(s.bearer),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          ok,
          client: this.clientId,
          result: result == null ? null : String(result).slice(0, 500),
        }),
        throw: false,
      });
    } catch {
      /* ack is best-effort — a dropped ack is cosmetic */
    }
  }
}
