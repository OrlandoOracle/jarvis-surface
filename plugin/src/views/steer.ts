// The send half of the board: the authenticated steering client the dashboard uses to
// act on a live session. It wraps the four sessions-daemon steering endpoints —
// GET /menu (what is the pane asking), POST /say (type a line), POST /choose (pick a
// numbered option), POST /interrupt (ESC) — behind `requestUrl`, the one transport that
// works in Obsidian mobile's WKWebView without tripping CORS/ATS.
//
// Base URL is the SAME keystone HTTPS front the board reads (`board.daemonUrl`), never
// the raw daemon on :8091 — iOS ATS blocks cleartext, so the keystone proxies these
// routes over TLS (it strips the /jarvis mount, so it sees /say, /choose, …).
//
// AUTH: the `token` here is the keystone CMD bearer (the device's `remote.bearer`), NOT
// the raw daemon steer token. It travels as `?bearer=`; the keystone validates it and
// then injects the daemon token server-side before proxying. This is why no device —
// iPad or phone — ever needs the raw daemon key: it only presents the keystone bearer it
// already holds for the remote channel. The client never throws on an HTTP error — it
// returns a tagged result so the modal can show the reason inline.

import { requestUrl } from "obsidian";

/** What a pane is asking right now, as parsed by `session_steer.parse_menu`. */
export interface Menu {
  question: string;
  options: string[];
}

export type MenuResult =
  | { kind: "menu"; menu: Menu }
  | { kind: "none"; tail: string } // steering on, but the pane shows no menu
  | { kind: "error"; status: number; error: string };

/** The read-only transcript tail of a session's active pane. */
export type TailResult =
  | { kind: "tail"; pane: string; text: string }
  | { kind: "error"; status: number; error: string };

export type SteerResult =
  | { kind: "ok"; detail: string }
  /** 409: well-formed + authed, but the WORLD said no (wrong pane, PHI host, menu moved). */
  | { kind: "refused"; error: string }
  | { kind: "error"; status: number; error: string };

function trimBase(u: string): string {
  return (u || "").replace(/\/+$/, "");
}

export class SteerClient {
  constructor(
    private readonly base: string,
    private readonly token: string,
  ) {}

  /** True only when both an endpoint and a bearer are present — the modal greys the
   *  steer controls otherwise rather than firing a request that can only 401/404. */
  get configured(): boolean {
    return !!trimBase(this.base) && !!this.token;
  }

  /** The keystone bearer rides the query string (the keystone reads `?bearer=`), so a
   *  POST only needs a JSON content-type header. */
  private bearerQuery(): string {
    return "bearer=" + encodeURIComponent(this.token);
  }

  private errFrom(status: number, text: string): string {
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j && typeof j.error === "string") return j.error;
    } catch {
      /* non-JSON body — fall through to the raw text */
    }
    return text ? text.slice(0, 200) : `HTTP ${status}`;
  }

  /** Read what the pane is CURRENTLY asking. Pane ids start with "%", so the query is
   *  encodeURIComponent'd — an undecoded "%6" becomes "%256" daemon-side and finds no
   *  pane (a bug the daemon's own comments call out). */
  async menu(host: string, pane: string): Promise<MenuResult> {
    if (!this.configured) {
      return { kind: "error", status: 0, error: "steering not configured" };
    }
    const url =
      trimBase(this.base) +
      "/menu?host=" +
      encodeURIComponent(host) +
      "&pane=" +
      encodeURIComponent(pane) +
      "&" +
      this.bearerQuery();
    try {
      const r = await requestUrl({
        url,
        method: "GET",
        throw: false,
      });
      if (r.status !== 200) {
        return { kind: "error", status: r.status, error: this.errFrom(r.status, r.text) };
      }
      const body = (r.json ?? JSON.parse(r.text)) as { menu: Menu | null; tail?: string };
      if (body.menu && Array.isArray(body.menu.options) && body.menu.options.length) {
        return { kind: "menu", menu: body.menu };
      }
      return { kind: "none", tail: body.tail ?? "" };
    } catch (e) {
      return { kind: "error", status: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Read-only transcript tail of a session's active pane. Unlike `menu`, the target
   *  is a session NAME (what the feed reports), which the daemon resolves to the active
   *  pane server-side. Same keystone bearer + PHI fence as every other read. */
  async tail(host: string, name: string, lines = 200): Promise<TailResult> {
    if (!this.configured) {
      return { kind: "error", status: 0, error: "steering not configured" };
    }
    const url =
      trimBase(this.base) +
      "/pane?host=" +
      encodeURIComponent(host) +
      "&name=" +
      encodeURIComponent(name) +
      "&lines=" +
      String(lines) +
      "&" +
      this.bearerQuery();
    try {
      const r = await requestUrl({ url, method: "GET", throw: false });
      if (r.status !== 200) {
        return { kind: "error", status: r.status, error: this.errFrom(r.status, r.text) };
      }
      const body = (r.json ?? JSON.parse(r.text)) as { pane?: string; tail?: string };
      return { kind: "tail", pane: body.pane ?? "", text: body.tail ?? "" };
    } catch (e) {
      return { kind: "error", status: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private async post(
    sub: string,
    payload: Record<string, unknown>,
    okDetail: (body: Record<string, unknown>) => string,
  ): Promise<SteerResult> {
    if (!this.configured) {
      return { kind: "error", status: 0, error: "steering not configured" };
    }
    try {
      const r = await requestUrl({
        url: trimBase(this.base) + sub + "?" + this.bearerQuery(),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        throw: false,
      });
      if (r.status === 200) {
        const body = (r.json ?? JSON.parse(r.text)) as Record<string, unknown>;
        return { kind: "ok", detail: okDetail(body) };
      }
      // 409 is the daemon's "authorised but the world said no" — surface it as a refusal,
      // not a transport error, so the modal can say "the pane moved on" rather than "failed".
      if (r.status === 409) {
        return { kind: "refused", error: this.errFrom(r.status, r.text) };
      }
      return { kind: "error", status: r.status, error: this.errFrom(r.status, r.text) };
    } catch (e) {
      return { kind: "error", status: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Type one line into the pane and press Enter. Daemon refuses newlines / over-long lines. */
  say(host: string, pane: string, text: string): Promise<SteerResult> {
    return this.post("/say", { host, pane, text }, (b) => `said: ${String(b.said ?? text)}`);
  }

  /** Pick 0-based `option` of the menu the pane is CURRENTLY showing. `expect` is the
   *  option text we rendered — the daemon refuses (409) if the menu moved since, so a
   *  slow tap can never answer a question that has already changed. */
  choose(host: string, pane: string, option: number, expect?: string): Promise<SteerResult> {
    return this.post(
      "/choose",
      { host, pane, option, ...(expect != null ? { expect } : {}) },
      (b) => `chose: ${String(b.chose ?? option)}`,
    );
  }

  /** Send ESC — cancel the pane's current prompt. */
  interrupt(host: string, pane: string): Promise<SteerResult> {
    return this.post("/interrupt", { host, pane }, () => "interrupted");
  }
}
