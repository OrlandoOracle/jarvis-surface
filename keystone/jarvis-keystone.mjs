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

const PORT = 7920;
const BUS = path.join(os.homedir(), "Deborah/00-System/jarvis-bus");
const ACTIONS = path.join(BUS, "actions");
fs.mkdirSync(ACTIONS, { recursive: true });

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

function page(p, id, tapped) {
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
<div class="kicker">Deborah · work done</div>
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
document.querySelectorAll("button.act").forEach(function(b){
  b.addEventListener("click",function(){
    var action=b.getAttribute("data-action");
    document.querySelectorAll("button.act").forEach(function(x){x.disabled=true});
    fetch("action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:ID,action:action})})
      .then(function(r){return r.json()})
      .then(function(){location.href="r/"+ID+"?tapped="+encodeURIComponent(action)})
      .catch(function(){document.getElementById("msg").textContent="Network hiccup — tap again (Tailscale may have stalled).";document.querySelectorAll("button.act").forEach(function(x){x.disabled=false})});
  });
});
</script></body></html>`;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const p = u.pathname;

  // GET .../r/<id>
  const m = p.match(/\/r\/([a-zA-Z0-9_-]+)\/?$/);
  if (req.method === "GET" && m) {
    const payload = readPayload(m[1]);
    if (!payload) {
      res.writeHead(404, { "content-type": "text/html" });
      return res.end("<h1>Not found or expired</h1>");
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(page(payload, m[1], u.searchParams.get("tapped")));
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
    return res.end(JSON.stringify({ ok: true, svc: "jarvis-keystone" }));
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("jarvis-keystone");
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`jarvis-keystone on 127.0.0.1:${PORT} · bus=${BUS}`)
);
