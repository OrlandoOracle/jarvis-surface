# `src/remote/` — follow-on port (NOT done in the scaffold unit)

The tailnet remote-control channel from **deborah-remote**. This is the SSE/bearer
client that holds a connection to todaystream's `/cmd/stream` on d2 and executes
pushed ops (open notes, flip Reading mode, run commands, edit the vault, ack
results back).

## ⚠ Compiled-only — reverse-engineer required

**There is no TypeScript source for deborah-remote.** The only source of truth is
the compiled, hand-written CommonJS plugin:

- `~/Code/obsidian-deborah-remote/main.js` (~39 KB, plain CJS, no build step)
- `~/Code/obsidian-deborah-remote/README.md`
- `~/Code/obsidian-deborah-remote/manifest.json` / `styles.css` / `versions.json`

Porting it means reading `main.js` and re-expressing it as `src/remote/*.ts`, not
copy-pasting a `.ts` file (none exists). Do not machine-translate blindly — the file
is terse and load-bearing.

## What to lift (verified from main.js)

- `DEFAULTS` (main.js ~L37): `baseUrl`, `bearer`, `remoteControl`, `allowEval`.
  Already folded into `remote` in `src/state/settings.ts` — reuse that, do not
  re-declare a second settings bag.
- `ALLOWED_OPS` (main.js ~L51): the op allow-list the command dispatcher gates on —
  `['hello','notice','open','openstream','mode','command','create','modify','append','delete']`,
  plus `eval` guarded separately behind `allowEval`.
- The SSE connect/reconnect loop (`/stream?bearer=…`), the `/send` type-back, the
  `/run` ack path, and `trimBase()`.

## Security constraints (do not weaken on port)

- Tailnet-only, bearer-gated. **The bearer is a root key** — the channel can run
  arbitrary JS with full vault access. Device-local in data.json, never synced,
  never committed.
- `eval` stays OFF by default and behind `allowEval`.
- d1 must never be a remote target (PHI).
