#!/usr/bin/env node
/**
 * jarvis-keystone — the deep-link result-page proof for the JARVIS Surface.
 *
 * The keystone loop (web-first, per the 2026-10-05 research verdict):
 *   Claude/orchestrator finishes work
 *     │ jarvis-notify writes a work-done payload + texts a TAPPABLE https link
 *     ▼
 *   Deborah SMS (233-9385):  https://mac-mini.tail1fd1c8.ts.net/jarvis/r/<id>
 *     │ Sebastian taps on his iPhone  → Safari (NO app dependency, survives cold start)
 *     ▼
 *   GET /r/<id>  → this service renders "what was done" + action buttons
 *     │ tap a button → POST /action {id, action}
 *     ▼
 *   the tap is written to the jarvis-bus actions dir; the orchestrator polls it
 *   and starts the next phase / approves / closes the session.
 *   An optional "Open in Obsidian" button is a USER-TAPPED obsidian://adv-uri
 *   (never a server redirect — that is broken on iOS 13+).
 *
 * No dependencies (Node stdlib only). Binds LOOPBACK ONLY; the tailnet reaches
 * it solely through `tailscale serve --set-path /jarvis`. Path-prefix agnostic
 * (matches on the /r/ and /action suffixes) so it works whether or not Tailscale
 * strips the mount prefix.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const PORT = 7920;
const BUS = path.join(os.homedir(), "Deborah/00-System/jarvis-bus");
const ACTIONS = path.join(BUS, "actions");
const CMD_ACKS = path.join(BUS, "cmd-acks");
const ICONDIR = path.dirname(fileURLToPath(import.meta.url)); // icon-*.png live beside this file
fs.mkdirSync(ACTIONS, { recursive: true });
fs.mkdirSync(CMD_ACKS, { recursive: true });

// --- remote command channel ------------------------------------------------
// The ported deborah-remote plugin (src/remote) connects a long-lived SSE socket to
// /cmd/stream and POSTs results to /cmd/ack. An orchestrator enqueues a command with
// POST /cmd/push {op,...}, which fans it out to every connected surface. This is the
// Mini-side inbound that replaces the dead d2 `todaystream` the channel used to use.
//
// Bearer-gated: the key is device-local on the Mini (env JARVIS_CMD_BEARER), NEVER
// committed and NEVER synced — it matches the plugin's device-local `bearer`. With no
// key set the channel is DISABLED (503), mirroring the plugin no-op-without-bearer rule.
// The sessions-daemon the board reads. It binds the tailnet IP over PLAIN HTTP, which
// iOS App Transport Security blocks from the Obsidian mobile `requestUrl` — so the board
// cannot hit it directly on a phone/iPad. The keystone proxies it over its HTTPS 443
// serve front (the one transport proven to reach iOS), so the board fetches
// `{keystone}/projects` and never touches cleartext.
const DAEMON = (process.env.JARVIS_DAEMON || "http://100.82.86.21:8091").replace(/\/+$/, "");

const CMD_BEARER = process.env.JARVIS_CMD_BEARER || "";
const cmdClients = new Set(); // live SSE res objects (desktop/curl; kept for debug)
let cmdSeq = 0; // monotonic ack-correlation id the service stamps on each pushed cmd

// Long-poll transport (the real one — works in Obsidian mobile's WKWebView, which does
// NOT fire cross-origin EventSource). Commands land in a small ring buffer keyed by the
// same monotonic id; a client polls GET /cmd/poll?after=<lastId> and the request is held
// open until a newer command exists or HOLD_MS elapses. Cursor-based, so a client that
// reconnects resumes after its last-seen id with no replay, and a command pushed while a
// client is between polls is still caught (the SSE fan-out alone would drop it).
const CMD_BUFFER = []; // [{id, op, ...}] recent commands, trimmed to CMD_BUFFER_MAX
const CMD_BUFFER_MAX = 100;
const cmdWaiters = new Set(); // {res, after, timer, who}
const HOLD_MS = 12000; // under common HTTP-client timeouts so requestUrl doesn't abort first

function endJson(res, code, obj) {
  try {
    res.writeHead(code, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify(obj));
  } catch {}
}

// Hand a waiting long-poll any commands newer than its cursor. Returns true if it fired.
function deliverTo(w) {
  const cmds = CMD_BUFFER.filter((c) => c.id > w.after);
  if (!cmds.length) return false;
  clearTimeout(w.timer);
  cmdWaiters.delete(w);
  endJson(w.res, 200, { cmds, cursor: cmds[cmds.length - 1].id });
  return true;
}

// Relay a GET to the plain-HTTP sessions-daemon and return its JSON over this HTTPS
// front (so iOS ATS never sees cleartext). Streams the body through untouched; adds CORS.
function proxyDaemon(subpath, res) {
  const target = DAEMON + subpath;
  const r = http.get(target, { timeout: 8000 }, (dr) => {
    let body = "";
    dr.on("data", (c) => (body += c));
    dr.on("end", () => {
      res.writeHead(dr.statusCode || 502, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      });
      res.end(body);
    });
  });
  r.on("error", () => endJson(res, 502, { error: "daemon unreachable", target }));
  r.on("timeout", () => {
    r.destroy();
    endJson(res, 504, { error: "daemon timeout", target });
  });
}

// Relay a request (any method) to the plain-HTTP daemon, forwarding the Authorization
// bearer and a JSON body — the daemon's steering endpoints (/say, /choose, /interrupt)
// are token-gated POSTs, and /menu is a token-gated GET. Same TLS-front rationale as
// proxyDaemon: iOS ATS blocks cleartext, so the dashboard's steer client talks to the
// keystone and the keystone talks cleartext to the loopback/tailnet daemon. The bearer
// is NEVER stored here — it is the device's steerToken, passed straight through.
function proxyDaemonReq(method, subpath, incoming, bodyBuf, res) {
  const target = DAEMON + subpath;
  const headers = {};
  if (incoming.headers["authorization"]) headers["authorization"] = incoming.headers["authorization"];
  if (bodyBuf && bodyBuf.length) {
    headers["content-type"] = "application/json";
    headers["content-length"] = Buffer.byteLength(bodyBuf);
  }
  const r = http.request(target, { method, headers, timeout: 8000 }, (dr) => {
    let body = "";
    dr.on("data", (c) => (body += c));
    dr.on("end", () => {
      res.writeHead(dr.statusCode || 502, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      });
      res.end(body);
    });
  });
  r.on("error", () => endJson(res, 502, { error: "daemon unreachable", target }));
  r.on("timeout", () => {
    r.destroy();
    endJson(res, 504, { error: "daemon timeout", target });
  });
  if (bodyBuf && bodyBuf.length) r.write(bodyBuf);
  r.end();
}

// Read the full request body as a Buffer, then hand it to `cb`. Caps at 64 KB — a steer
// line or a choose index is tiny; anything larger is refused rather than buffered.
function withBody(req, res, cb) {
  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    if (size > 65536) {
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => cb(Buffer.concat(chunks)));
  req.on("error", () => endJson(res, 400, { error: "bad request body" }));
}

// Constant-time bearer check. Returns false when the channel is disabled (no key set)
// or the presented bearer does not match — never leak which via timing.
function bearerOk(presented) {
  if (!CMD_BEARER) return false;
  const a = Buffer.from(String(presented || ""));
  const b = Buffer.from(CMD_BEARER);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// SSE keepalive: a comment line every 25s so `tailscale serve` / any proxy does not
// drop an idle command socket. One shared timer walks the live-client set.
setInterval(() => {
  for (const res of cmdClients) {
    try { res.write(": ping\n\n"); } catch {}
  }
}, 25000).unref();

// `tailscale serve` STRIPS the /jarvis mount prefix before we see the request
// (verified 2026-10-05: the service only ever sees /, /r/<id>, /manifest…), so
// routing matches on suffixes and works regardless. But emitted absolute URLs
// (manifest start_url/scope/icons, apple-touch-icon, the action POST target) are
// resolved by the BROWSER against the origin, whose root is a DIFFERENT service
// (:8899). They must therefore carry the external prefix, which is fixed deploy
// config — not derivable from the stripped path. Hardcode it (env-overridable).
const MOUNT = process.env.JARVIS_MOUNT ?? "/jarvis";

// newest work-done payload in the bus (home shows the latest check-in)
function latestPayload() {
  let best = null;
  for (const f of fs.readdirSync(BUS)) {
    if (!f.endsWith(".json")) continue;
    const full = path.join(BUS, f);
    try {
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      if (!best || st.mtimeMs > best.mtime) best = { id: f.slice(0, -5), mtime: st.mtimeMs };
    } catch {}
  }
  if (!best) return null;
  const p = readPayload(best.id);
  return p ? { id: best.id, payload: p } : null;
}

function pwaHead(mount) {
  return `<link rel="manifest" href="${mount}/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="JARVIS">
<meta name="theme-color" content="#07070c">
<link rel="apple-touch-icon" href="${mount}/icon-180.png">
<link rel="icon" type="image/png" href="${mount}/icon-192.png">`;
}

function manifest(mount) {
  return JSON.stringify({
    name: "JARVIS Surface",
    short_name: "JARVIS",
    start_url: `${mount}/`,
    scope: `${mount}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#07070c",
    theme_color: "#07070c",
    icons: [
      { src: `${mount}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${mount}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  });
}

function homePage(mount) {
  const latest = latestPayload();
  if (latest) return page(latest.payload, latest.id, null, mount, true);
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>JARVIS Surface</title>
${pwaHead(mount)}
<style>
body{margin:0;background:#07070c;color:#f3f3f7;font:16px/1.55 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:env(safe-area-inset-top) 18px env(safe-area-inset-bottom)}
.box{max-width:420px;text-align:center}
.kicker{color:#ff4d6d;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:12px}
h1{font-size:24px;margin:.4em 0}
p{color:#9a9ab0}
</style></head><body><div class="box">
<div class="kicker">Deborah · JARVIS surface</div>
<h1>No check-ins yet</h1>
<p>When a session finishes work, it lands here — and Deborah texts you the link.</p>
</div></body></html>`;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// tiny, safe markdown-ish → html (headings, bold, bullets, line breaks)
function mdLite(src) {
  const lines = String(src || "").split("\n");
  let html = "", inUl = false;
  for (const raw of lines) {
    const line = esc(raw);
    if (/^\s*[-*]\s+/.test(raw)) {
      if (!inUl) { html += "<ul>"; inUl = true; }
      html += `<li>${line.replace(/^\s*[-*]\s+/, "")}</li>`;
      continue;
    }
    if (inUl) { html += "</ul>"; inUl = false; }
    if (/^#{1,3}\s+/.test(raw)) {
      const n = raw.match(/^#+/)[0].length;
      html += `<h${n + 1}>${line.replace(/^#+\s+/, "")}</h${n + 1}>`;
    } else if (raw.trim() === "") {
      html += "<div class='sp'></div>";
    } else {
      html += `<p>${line}</p>`;
    }
  }
  if (inUl) html += "</ul>";
  return html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function readPayload(id) {
  const f = path.join(BUS, `${id}.json`);
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; }
}

function page(p, id, tapped, mount = "", isHome = false) {
  const actions = Array.isArray(p.actions) && p.actions.length
    ? p.actions
    : [
        { id: "next", label: "Start next phase" },
        { id: "approve", label: "Approve" },
        { id: "close", label: "Close out session" },
      ];
  const btns = actions
    .map(
      (a) =>
        `<button class="act" data-action="${esc(a.id)}">${esc(a.label)}</button>`
    )
    .join("");
  const obsBtn = p.obsidian_uri
    ? `<a class="obs" href="${esc(p.obsidian_uri)}">Open in Obsidian</a>`
    : "";
  const tappedBanner = tapped
    ? `<div class="done">✓ You chose: <strong>${esc(tapped)}</strong> — the session will pick this up.</div>`
    : "";
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${esc(p.title || "Work done")}</title>
${pwaHead(mount)}
<style>
:root{--bg:#07070c;--card:#12121b;--ink:#f3f3f7;--muted:#9a9ab0;--accent:#ff4d6d;--accent2:#5b8cff;--line:#262636}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
.wrap{max-width:640px;margin:0 auto;padding:22px 18px 40px}
.kicker{color:var(--accent);font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:12px}
h1{font-size:26px;line-height:1.15;margin:.3em 0 .1em}
.meta{color:var(--muted);font-size:13px;margin-bottom:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 18px 6px;margin-bottom:22px}
.card h2{font-size:16px;margin:.6em 0 .2em;color:var(--ink)}
.card h3,.card h4{font-size:15px;margin:.6em 0 .2em;color:var(--ink)}
.card p{margin:.35em 0;color:#d9d9e6}
.card ul{margin:.3em 0 .6em;padding-left:1.2em}.card li{margin:.2em 0;color:#d9d9e6}
.sp{height:.5em}
.actions{display:flex;flex-direction:column;gap:12px}
button.act{appearance:none;border:0;border-radius:14px;padding:16px;font-size:17px;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--accent),#c81e48);box-shadow:0 6px 18px rgba(255,77,109,.25);cursor:pointer}
button.act:nth-child(2){background:linear-gradient(135deg,var(--accent2),#2f5fd6);box-shadow:0 6px 18px rgba(91,140,255,.22)}
button.act:nth-child(3){background:#1c1c28;border:1px solid var(--line);color:var(--muted);box-shadow:none}
button.act:active{transform:translateY(1px)}
button.act[disabled]{opacity:.4}
a.obs{display:block;text-align:center;margin-top:16px;color:var(--accent2);font-weight:600;text-decoration:none;padding:12px;border:1px solid var(--line);border-radius:14px}
.done{background:#0d2a16;border:1px solid #1f6b36;color:#8ff0b0;border-radius:12px;padding:14px;margin-bottom:18px;font-size:15px}
.err{color:var(--muted);font-size:13px;margin-top:20px}
@media(prefers-color-scheme:light){:root{--bg:#f6f6fa;--card:#fff;--ink:#14141c;--muted:#5a5a70;--line:#e3e3ee}button.act:nth-child(3){background:#eee;color:#555}}
</style></head><body><div class="wrap">
<div class="kicker">Deborah · ${isHome ? "latest check-in" : "work done"}</div>
<h1>${esc(p.title || "Work done")}</h1>
<div class="meta">${esc(p.session || "session")}${p.created ? " · " + esc(p.created) : ""}</div>
${tappedBanner}
<div class="card">${mdLite(p.summary_md || "_(no summary)_")}</div>
<div class="actions">${btns}</div>
${obsBtn}
<div class="err" id="msg"></div>
</div>
<script>
var ID=${JSON.stringify(id)};
// ACTION_URL is injected server-side from the derived mount prefix so it is
// identical on the /r/<id> card and the PWA home base (no /r/r/ double paths).
var ACTION_URL=${JSON.stringify(`${mount}/action`)};
var SELF_URL=location.pathname;
document.querySelectorAll("button.act").forEach(function(b){
  b.addEventListener("click",function(){
    var action=b.getAttribute("data-action");
    document.querySelectorAll("button.act").forEach(function(x){x.disabled=true});
    fetch(ACTION_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:ID,action:action})})
      .then(function(r){return r.json()})
      .then(function(){location.href=SELF_URL+"?tapped="+encodeURIComponent(action)})
      .catch(function(){document.getElementById("msg").textContent="Network hiccup — tap again (Tailscale may have stalled).";document.querySelectorAll("button.act").forEach(function(x){x.disabled=false})});
  });
});
</script></body></html>`;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const p = u.pathname;
  const mount = MOUNT; // external prefix for emitted URLs (serve strips it inbound)

  // GET .../cmd/stream?bearer=&client=  (long-lived SSE command socket)
  if (req.method === "GET" && /\/cmd\/stream\/?$/.test(p)) {
    if (!bearerOk(u.searchParams.get("bearer"))) {
      const who = u.searchParams.get("client") || "?";
      const presented = u.searchParams.get("bearer") || "";
      // Log the REJECT so a device that reaches us with a bad/empty bearer is
      // distinguishable from one that never reaches us at all (a network/tailnet
      // problem). Never log the key itself — only its length + a short fingerprint.
      console.log(
        `[cmd] stream REJECT client=${who} code=${CMD_BEARER ? 401 : 503} ` +
          `presented_len=${presented.length} fp=${presented.slice(0, 4)}…${presented.slice(-2)}`,
      );
      res.writeHead(CMD_BEARER ? 401 : 503, { "content-type": "text/plain" });
      return res.end(CMD_BEARER ? "unauthorized" : "command channel disabled (no bearer configured)");
    }
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // The plugin's EventSource runs in Obsidian's renderer (origin app://obsidian.md),
      // so this is a cross-origin request. Without ACAO, Chromium rejects the stream in
      // milliseconds and — CORS failures being terminal — never reconnects. The channel
      // is bearer-gated regardless of origin, so a wildcard here grants nothing extra.
      "access-control-allow-origin": "*",
    });
    res.write("retry: 4000\n");
    res.write(": connected\n\n"); // open the stream immediately so EventSource fires onopen
    cmdClients.add(res);
    const _t0 = Date.now();
    const _who = u.searchParams.get("client") || "?";
    console.log(`[cmd] stream CONNECT client=${_who} clients=${cmdClients.size}`);
    req.on("close", () => {
      cmdClients.delete(res);
      console.log(`[cmd] stream CLOSE   client=${_who} dur=${Date.now() - _t0}ms clients=${cmdClients.size}`);
    });
    return;
  }

  // GET .../cmd/poll?bearer=&client=&after=<id>  (long-poll — the mobile-safe transport)
  if (req.method === "GET" && /\/cmd\/poll\/?$/.test(p)) {
    if (!bearerOk(u.searchParams.get("bearer"))) {
      const who = u.searchParams.get("client") || "?";
      console.log(`[cmd] poll REJECT client=${who} code=${CMD_BEARER ? 401 : 503}`);
      return endJson(res, CMD_BEARER ? 401 : 503, { ok: false });
    }
    const who = u.searchParams.get("client") || "?";
    const afterRaw = u.searchParams.get("after");
    // No cursor = a fresh client syncing: hand back the current id with NO replay, so it
    // resumes from "now" and only sees commands pushed after it connected (SSE semantics).
    if (afterRaw == null || afterRaw === "") {
      console.log(`[cmd] poll SYNC   client=${who} -> cursor=${cmdSeq}`);
      return endJson(res, 200, { cmds: [], cursor: cmdSeq });
    }
    const after = parseInt(afterRaw, 10) || 0;
    const w = { res, after, timer: null, who };
    // Immediate if the buffer already holds something newer than the client's cursor.
    if (deliverTo(w)) {
      console.log(`[cmd] poll HIT    client=${who} after=${after}`);
      return;
    }
    // Otherwise hold the request open until a command arrives or HOLD_MS elapses.
    w.timer = setTimeout(() => {
      cmdWaiters.delete(w);
      endJson(res, 200, { cmds: [], cursor: after });
    }, HOLD_MS);
    cmdWaiters.add(w);
    console.log(`[cmd] poll WAIT   client=${who} after=${after} waiters=${cmdWaiters.size}`);
    req.on("close", () => {
      clearTimeout(w.timer);
      cmdWaiters.delete(w);
    });
    return;
  }

  // POST .../cmd/push {op,...}  (orchestrator enqueues a command → fan out to surfaces)
  if (req.method === "POST" && /\/cmd\/push\/?$/.test(p)) {
    if (!bearerOk(u.searchParams.get("bearer"))) {
      res.writeHead(CMD_BEARER ? 401 : 503, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: false }));
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let cmd = {};
      try { cmd = JSON.parse(body || "{}"); } catch {}
      if (!cmd.op) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: false, error: "missing op" }));
      }
      // The service stamps its own monotonic id over whatever was sent (the plugin's
      // dispatcher correlates its ack by this id), matching the original contract.
      cmd.id = ++cmdSeq;
      // Buffer for the long-poll transport (trim to the last CMD_BUFFER_MAX).
      CMD_BUFFER.push(cmd);
      if (CMD_BUFFER.length > CMD_BUFFER_MAX) {
        CMD_BUFFER.splice(0, CMD_BUFFER.length - CMD_BUFFER_MAX);
      }
      // Wake any held long-polls whose cursor is now behind.
      let polled = 0;
      for (const w of [...cmdWaiters]) if (deliverTo(w)) polled++;
      // Fan out to any live SSE clients too (desktop/curl debug path).
      const line = `data: ${JSON.stringify(cmd)}\n\n`;
      let delivered = 0;
      for (const c of cmdClients) {
        try { c.write(line); delivered++; } catch {}
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, id: cmd.id, delivered: delivered + polled, sse: delivered, polled }));
    });
    return;
  }

  // POST .../cmd/ack?bearer=  {id, ok, client, result}  (a surface reports a result)
  if (req.method === "POST" && /\/cmd\/ack\/?$/.test(p)) {
    if (!bearerOk(u.searchParams.get("bearer"))) {
      res.writeHead(CMD_BEARER ? 401 : 503, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: false }));
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let j = {};
      try { j = JSON.parse(body || "{}"); } catch {}
      if (j.id == null) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: false }));
      }
      // Persist the ack so an orchestrator can poll the result, mirroring actions/.
      const rec = {
        id: String(j.id).slice(0, 40),
        ok: !!j.ok,
        client: String(j.client || "").slice(0, 40),
        result: j.result == null ? null : String(j.result).slice(0, 500),
        at: new Date().toISOString(),
      };
      if (/^[a-zA-Z0-9_-]+$/.test(rec.id)) {
        fs.writeFileSync(path.join(CMD_ACKS, `${rec.id}.json`), JSON.stringify(rec, null, 2));
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // GET .../projects  (board feed — proxied from the plain-HTTP daemon over HTTPS)
  if (req.method === "GET" && /\/projects\/?$/.test(p)) {
    console.log(`[board] /projects hit ua=${(req.headers["user-agent"] || "?").slice(0, 30)}`);
    return proxyDaemon("/projects" + (u.search || ""), res);
  }
  // GET .../sessions  (live sessions — same proxy, for a later view)
  if (req.method === "GET" && /\/sessions\/?$/.test(p)) {
    return proxyDaemon("/sessions" + (u.search || ""), res);
  }

  // GET .../menu?host=&pane=  (what the pane is asking — token-gated, forwarded through)
  if (req.method === "GET" && /\/menu\/?$/.test(p)) {
    return proxyDaemonReq("GET", "/menu" + (u.search || ""), req, null, res);
  }
  // POST .../say | /choose | /interrupt  (the dashboard's steering writes → daemon)
  // Bearer-gated by the daemon; the keystone only forwards the Authorization header.
  {
    const steer = p.match(/\/(say|choose|interrupt)\/?$/);
    if (req.method === "POST" && steer) {
      return withBody(req, res, (buf) => proxyDaemonReq("POST", "/" + steer[1], req, buf, res));
    }
  }

  // GET .../manifest.webmanifest  (PWA manifest)
  if (req.method === "GET" && /\/manifest\.webmanifest$/.test(p)) {
    res.writeHead(200, { "content-type": "application/manifest+json; charset=utf-8" });
    return res.end(manifest(mount));
  }

  // GET .../icon-<sz>.png  (PWA + apple-touch icons, served from disk)
  const ic = p.match(/\/(icon-\d+\.png)$/);
  if (req.method === "GET" && ic) {
    const f = path.join(ICONDIR, ic[1]);
    if (/^icon-(180|192|512)\.png$/.test(ic[1]) && fs.existsSync(f)) {
      res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=86400" });
      return res.end(fs.readFileSync(f));
    }
    res.writeHead(404); return res.end();
  }

  // GET .../r/<id>  (result card)
  const m = p.match(/\/r\/([a-zA-Z0-9_-]+)\/?$/);
  if (req.method === "GET" && m) {
    const payload = readPayload(m[1]);
    if (!payload) {
      res.writeHead(404, { "content-type": "text/html" });
      return res.end("<h1>Not found or expired</h1>");
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(page(payload, m[1], u.searchParams.get("tapped"), mount, false));
  }

  // GET home base (PWA start_url): /jarvis/ | /jarvis | /  → latest check-in
  if (
    req.method === "GET" &&
    (p === "/" || /^\/[a-zA-Z0-9_-]+\/?$/.test(p)) &&
    !/\/(action|health)\/?$/.test(p)
  ) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(homePage(mount));
  }

  // POST .../action  {id, action}
  if (req.method === "POST" && /\/action\/?$/.test(p)) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let j = {};
      try { j = JSON.parse(body || "{}"); } catch {}
      if (!j.id || !/^[a-zA-Z0-9_-]+$/.test(j.id) || !j.action) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: false }));
      }
      const rec = { id: j.id, action: String(j.action).slice(0, 40), at: new Date().toISOString() };
      fs.writeFileSync(path.join(ACTIONS, `${j.id}.json`), JSON.stringify(rec, null, 2));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...rec }));
    });
    return;
  }

  if (req.method === "GET" && /\/health\/?$/.test(p)) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({
      ok: true,
      svc: "jarvis-keystone",
      cmd: {
        enabled: !!CMD_BEARER,
        clients: cmdClients.size, // live SSE sockets (debug path)
        waiters: cmdWaiters.size, // held long-polls (the real transport)
        buffered: CMD_BUFFER.length,
        seq: cmdSeq,
      },
    }));
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("jarvis-keystone");
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`jarvis-keystone on 127.0.0.1:${PORT} · bus=${BUS}`)
);
