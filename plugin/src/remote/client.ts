// The receive half of the remote-control channel.
//
// Transport: LONG-POLL over Obsidian's native `requestUrl`, NOT EventSource. The
// original (and the first port) used an SSE EventSource, which works in Electron but
// NOT in Obsidian mobile's WKWebView — a cross-origin EventSource there never fires a
// request (verified 2026-10-05 on the iPad: zero server contact while the same URL
// loaded fine in iOS Chrome). `requestUrl` bypasses WKWebView's CORS entirely and
// behaves identically on desktop and mobile, so it is the one transport that makes the
// channel phone-first. The client polls GET /cmd/poll?after=<lastId>; the keystone
// holds the request open until a newer command exists (or ~12s), then the client
// dispatches each command and re-polls from the returned cursor.
//
// Endpoint is driven ENTIRELY by RemoteSettings.baseUrl (re-pointed to the Mini
// keystone). With no baseUrl or no bearer the loop idles cleanly without hammering.
//
// Security: tailnet-only, bearer-gated. The bearer is a ROOT key (arbitrary JS + full
// vault access via the dispatcher) — device-local in data.json, never synced, never
// committed. The loop is only ever started from the plugin's onload gate.

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
  private stopped = true;
  private polling = false;
  /** Last command id seen; null until the first sync poll establishes the cursor. */
  private cursor: number | null = null;
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
    if (this.polling) return; // one loop at a time; a restart stops then starts
    this.stopped = false;
    this.cursor = null; // re-sync from "now" on every (re)start
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    // The in-flight requestUrl resolves on its own; the loop exits on the next check.
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * The long-poll loop. One request at a time: ask for anything after our cursor, the
   * keystone holds it open until a command arrives (or ~12s), we dispatch each and
   * re-poll from the returned cursor. `requestUrl` is used instead of fetch/EventSource
   * because it is the only HTTP path that works in Obsidian mobile's WKWebView without
   * tripping CORS. A 401/503/error backs off RETRY_MS rather than spinning.
   */
  private async loop(): Promise<void> {
    this.polling = true;
    try {
      while (!this.stopped) {
        const s = this.deps.getSettings();
        const base = trimBase(s.baseUrl);
        const bearer = s.bearer;
        if (!base || !bearer) {
          await this.sleep(RETRY_MS); // not configured → idle, don't hammer
          continue;
        }
        try {
          const after = this.cursor;
          const url =
            base +
            "/cmd/poll?bearer=" +
            encodeURIComponent(bearer) +
            "&client=" +
            encodeURIComponent(this.clientId) +
            (after != null ? "&after=" + after : "");
          const r = await requestUrl({ url, method: "GET", throw: false });
          if (r.status === 200) {
            const body = (r.json ?? JSON.parse(r.text)) as {
              cmds?: RemoteCommand[];
              cursor?: number;
            };
            if (Array.isArray(body.cmds)) {
              for (const cmd of body.cmds) await this.dispatcher.execute(cmd);
            }
            if (typeof body.cursor === "number") this.cursor = body.cursor;
            // Clean 200 (held poll returned) → re-poll immediately, no backoff.
          } else {
            // 401/503 (bad/absent bearer, channel disabled) or other → back off.
            await this.sleep(RETRY_MS);
          }
        } catch {
          await this.sleep(RETRY_MS); // network error / client timeout → back off, re-poll
        }
      }
    } finally {
      this.polling = false;
    }
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
