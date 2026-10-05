# `src/ask/` — follow-on port (NOT done in the scaffold unit)

The tap-don't-type **ask-loop** from **pocketoracle**: the client half that polls the
po-broker for pending `AskUserQuestion` asks, pops a modal per ask, and POSTs the tap
back — first-wins across devices.

## Clean TS source exists — port it (do not rewrite)

Unlike deborah-remote, pocketoracle has real TypeScript:

- `~/Code/pocketoracle/src/ask/ask-loop.ts` — `AskLoop`: the HTTPS poller, the
  visibilitychange kick (fixes iOS backgrounding), the `closed`/`modals` bookkeeping.
- `~/Code/pocketoracle/src/ask/ask-modal.ts` — `AskModal`: the tap UI.
- `~/Code/pocketoracle/src/ask/types.ts` — `AskOption`, `AskQuestion`, `PendingAsk`,
  `Answers` (mirror Claude Code's `AskUserQuestion` tool_input shape).

Port these into `src/ask/*.ts` against the unified `ask` settings namespace
(`askLoop`, `brokerUrl`, `askPollMs`) already defined in `src/state/settings.ts`.

## The broker stays EXTERNAL

`~/Code/pocketoracle/broker/po-broker.mjs` is a Node-stdlib service and is **not**
ported into the plugin — the plugin only talks to it over HTTPS (Caddy :7890 →
loopback). Leave it where it runs.

## Design notes carried from pocketoracle P1

- Polling, not the signed OSC doorbell — keeps the whole delivery path on HTTPS (no
  terminal-injection surface) and survives iOS backgrounding.
- First-wins: whoever answers first wins; the broker 410s the losers and each
  device closes its stale modal on the next poll.

## Also in `term` (sibling concern, same plugin)

pocketoracle's terminal half (xterm.js over the ttyd/websocket front) maps to the
`term` settings namespace — a separate follow-on view, not part of the ask-loop.
