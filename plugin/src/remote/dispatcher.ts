// Reverse-engineered from obsidian-deborah-remote/main.js (2026-08-30, compiled-only
// CommonJS) — the command half of the tailnet remote-control channel. No .ts source
// ever existed; this re-expresses the `execute()` switch + the `ALLOWED_OPS` gate as
// TypeScript, bug-for-bug faithful to the original's fence and op semantics.
//
// The dispatcher is transport-agnostic on purpose: it takes an Obsidian `App`, an
// ack callback, and a live `allowEval` reader, and knows nothing about SSE. The
// client (client.ts) owns the socket and the /cmd/ack POST and hands each pushed op
// here. That split keeps the security surface — the op allow-list and the eval
// fence — in one place that can be unit-reasoned without a network.

import * as obsidian from "obsidian";
import { MarkdownView, Notice, TFile, type App, type Plugin } from "obsidian";

// Explicit allow-list, verbatim from main.js L51. Anything not named here is
// refused, so an op added upstream later is denied by default rather than silently
// granted. `eval` is deliberately NOT in this list — it is gated separately, behind
// the `allowEval` toggle, because it runs arbitrary JS with full vault access.
export const ALLOWED_OPS = [
  "hello",
  "notice",
  "open",
  "openstream",
  "mode",
  "command",
  "create",
  "modify",
  "append",
  "delete",
] as const;

export type AllowedOp = (typeof ALLOWED_OPS)[number];

/** One pushed command off the `/cmd/stream` SSE channel (loosely typed — it is wire JSON). */
export interface RemoteCommand {
  op: string;
  /** Channel ack-correlation id (the service stamps an integer over whatever was sent). */
  id?: number | string | null;
  msg?: string;
  path?: string;
  newLeaf?: boolean;
  mode?: string;
  /** For `op:"command"` — the command to run travels in its OWN field, since `id` is the ack id. */
  command_id?: string;
  content?: string;
  text?: string;
  js?: string;
}

/** Obsidian's command registry is not in the public typings; the original uses `app.commands`. */
interface CommandRegistry {
  executeCommandById(id: string): boolean;
}
interface AppWithCommands extends App {
  commands: CommandRegistry;
}

export interface DispatcherDeps {
  app: App;
  /** The owning plugin — passed into `eval`'d code as `plugin`, matching the original scope. */
  plugin: Plugin;
  /** Post a result back to the channel. Supplied by the client's /cmd/ack path. */
  ack: (id: RemoteCommand["id"], ok: boolean, result?: unknown) => Promise<void> | void;
  /** Read LIVE — the eval fence must reflect the current toggle, not a snapshot. */
  allowEval: () => boolean;
  /** Optional: handle the `openstream` op. The stream view is a separate follow-on unit. */
  openStream?: () => Promise<void> | void;
}

export class RemoteDispatcher {
  constructor(private readonly deps: DispatcherDeps) {}

  private fileByPath(path: string): TFile | null {
    const af = this.deps.app.vault.getAbstractFileByPath(path);
    return af instanceof TFile ? af : null;
  }

  // Flip the active markdown view between Reading (preview) and Source. Anything
  // that is not "reading"/"preview" means Source, exactly as the original.
  private async setMode(mode?: string): Promise<void> {
    const view = this.deps.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const state = view.getState();
    state.mode = mode === "reading" || mode === "preview" ? "preview" : "source";
    await view.setState(state, { history: false });
  }

  async execute(cmd: RemoteCommand): Promise<void> {
    if (!cmd || cmd.op === "hello") return;
    const { app, ack } = this.deps;

    // --- fence -------------------------------------------------------------
    // eval runs arbitrary JS pushed from a remote box inside this vault. Default
    // deny: refuse unless the toggle is explicitly on, and never persist a grant.
    if (cmd.op === "eval" && !this.deps.allowEval()) {
      await ack(cmd.id, false, "refused: eval is fenced (Settings -> JARVIS surface -> Allow eval)");
      new Notice("JARVIS remote: refused a pushed eval (fenced)");
      return;
    }
    if (cmd.op !== "eval" && !ALLOWED_OPS.includes(cmd.op as AllowedOp)) {
      await ack(cmd.id, false, "refused: op not in allow-list");
      return;
    }
    // -----------------------------------------------------------------------
    try {
      switch (cmd.op) {
        case "notice":
          new Notice(String(cmd.msg ?? ""));
          break;
        case "open":
          await app.workspace.openLinkText(cmd.path ?? "", "", !!cmd.newLeaf);
          if (cmd.mode) await this.setMode(cmd.mode);
          break;
        case "openstream":
          if (this.deps.openStream) await this.deps.openStream();
          else new Notice("JARVIS remote: stream view is not ported in this build");
          break;
        case "mode":
          await this.setMode(cmd.mode);
          break;
        case "command": {
          // `id` is the ack correlation id; the command to run rides `command_id`.
          const cid = cmd.command_id;
          if (!cid) throw new Error("command needs command_id");
          const reg = (app as AppWithCommands).commands;
          if (!reg.executeCommandById(cid)) throw new Error("no such command: " + cid);
          break;
        }
        case "create": {
          // Create-or-overwrite, matching the original: an existing path is modified.
          const ex = this.fileByPath(cmd.path ?? "");
          if (ex) await app.vault.modify(ex, cmd.content ?? "");
          else await app.vault.create(cmd.path ?? "", cmd.content ?? "");
          break;
        }
        case "modify": {
          const f = this.fileByPath(cmd.path ?? "");
          if (!f) throw new Error("no such file: " + cmd.path);
          await app.vault.modify(f, cmd.content ?? "");
          break;
        }
        case "append": {
          let f = this.fileByPath(cmd.path ?? "");
          if (!f) f = await app.vault.create(cmd.path ?? "", "");
          await app.vault.append(f, cmd.text ?? "");
          break;
        }
        case "delete": {
          // `trash(f, true)` = system trash, recoverable — never a hard unlink.
          const f = this.fileByPath(cmd.path ?? "");
          if (f) await app.vault.trash(f, true);
          break;
        }
        case "eval": {
          // Full control — arbitrary JS with app + plugin + obsidian in scope. Only
          // reachable because the fence above already confirmed allowEval() is true.
          const fn = new Function(
            "app",
            "plugin",
            "obsidian",
            '"use strict";return (async()=>{' + (cmd.js ?? "") + "})()",
          );
          const out = await fn(app, this.deps.plugin, obsidian);
          await ack(cmd.id, true, out);
          return;
        }
        default:
          throw new Error("unknown op: " + cmd.op);
      }
      await ack(cmd.id, true, "ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ack(cmd.id, false, msg);
      new Notice("JARVIS remote: " + msg);
    }
  }
}
