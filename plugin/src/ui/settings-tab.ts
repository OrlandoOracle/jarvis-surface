// The unified settings surface for the JARVIS plugin. One tab, four sections —
// `remote` / `board` / `ask` / `term` — mirroring the four namespaces in
// state/settings.ts. Each legacy plugin used to ship its own tab; this folds them
// into one so a device is configured in a single place.
//
// Two things earn their own treatment here:
//   - The remote `bearer` is a ROOT key (arbitrary-op command channel). It is the
//     ONLY way to arm the channel from the app, so it gets a masked text field and a
//     blunt warning. It is device-local — never synced, never committed — so editing
//     it here writes only this device's data.json.
//   - Any change under `remote` restarts the command-channel client, because the
//     socket is opened from a snapshot of baseUrl/bearer/remoteControl at connect
//     time; without a restart a new bearer would not take effect until reload.

import { App, PluginSettingTab, Setting } from "obsidian";
import type JarvisSurfacePlugin from "../main";

export class JarvisSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: JarvisSurfacePlugin,
  ) {
    super(app, plugin);
  }

  /**
   * Persist, then re-arm the affected subsystem off the new values: the command socket
   * (remote keys) and/or the ask-loop poller (ask keys). Each client snapshots its
   * config at start, so without the restart a changed URL/bearer/cadence would not take
   * effect until an Obsidian reload.
   */
  private async save(
    restartRemote = false,
    restartAsk = false,
    refreshTerm = false,
  ): Promise<void> {
    await this.plugin.saveSettings();
    if (restartRemote) this.plugin.restartRemote();
    if (restartAsk) this.plugin.restartAsk();
    // Font/line-height/key-bar apply live to an open pane; wsUrl/token take effect
    // on the next reopen (the socket snapshots them at connect).
    if (refreshTerm) this.plugin.refreshTerminals();
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    // --- remote: the command channel --------------------------------------
    new Setting(containerEl).setName("Remote command channel").setHeading();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "Tailnet-only, bearer-gated SSE channel. Deborah / the orchestrator pushes " +
        "ops (open a note, run a command, append) and this device executes them. " +
        "Nothing connects until both a base URL and a bearer are set.",
    });

    new Setting(containerEl)
      .setName("Enable remote control")
      .setDesc("Hold the command socket open and execute pushed ops.")
      .addToggle((t) =>
        t.setValue(s.remote.remoteControl).onChange(async (v) => {
          s.remote.remoteControl = v;
          await this.save(true);
        }),
      );

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("The keystone inbound, e.g. https://mac-mini.tail1fd1c8.ts.net/jarvis")
      .addText((t) =>
        t
          .setPlaceholder("https://mac-mini.tail1fd1c8.ts.net/jarvis")
          .setValue(s.remote.baseUrl)
          .onChange(async (v) => {
            s.remote.baseUrl = v.trim();
            await this.save(true);
          }),
      );

    new Setting(containerEl)
      .setName("Bearer (device-local)")
      .setDesc(
        "ROOT key for the channel — a holder can run arbitrary ops against this vault. " +
          "Stays on this device only (never synced, never committed). Must match the " +
          "keystone's JARVIS_CMD_BEARER.",
      )
      .addText((t) => {
        t.setPlaceholder("paste the device bearer")
          .setValue(s.remote.bearer)
          .onChange(async (v) => {
            s.remote.bearer = v.trim();
            await this.save(true);
          });
        t.inputEl.type = "password";
        t.inputEl.autocomplete = "off";
        t.inputEl.setAttribute("spellcheck", "false");
      });

    new Setting(containerEl)
      .setName("Allow eval (danger)")
      .setDesc(
        "Let the channel run arbitrary pushed JavaScript with full vault access. " +
          "Off unless you are actively debugging — this is remote code execution.",
      )
      .addToggle((t) =>
        t.setValue(s.remote.allowEval).onChange(async (v) => {
          s.remote.allowEval = v;
          await this.save(false);
        }),
      );

    // --- board: the project/session cockpit -------------------------------
    new Setting(containerEl).setName("Board (sessions)").setHeading();

    new Setting(containerEl)
      .setName("Daemon URL")
      .setDesc("The sessions-daemon feeding the board. Tailnet-only.")
      .addText((t) =>
        t
          .setPlaceholder("http://mac-mini.tail1fd1c8.ts.net:8091")
          .setValue(s.board.daemonUrl)
          .onChange(async (v) => {
            s.board.daemonUrl = v.trim();
            await this.save(false);
          }),
      );

    new Setting(containerEl)
      .setName("Steer token")
      .setDesc("Bearer for the daemon's steer endpoints. Only needed on a shell-less device.")
      .addText((t) => {
        t.setValue(s.board.steerToken).onChange(async (v) => {
          s.board.steerToken = v.trim();
          await this.save(false);
        });
        t.inputEl.type = "password";
        t.inputEl.autocomplete = "off";
      });

    new Setting(containerEl)
      .setName("Local fallback")
      .setDesc("Run the zsh session engine directly when the daemon is unreachable (desktop only).")
      .addToggle((t) =>
        t.setValue(s.board.localFallback).onChange(async (v) => {
          s.board.localFallback = v;
          await this.save(false);
        }),
      );

    new Setting(containerEl)
      .setName("Force web terminal")
      .setDesc("Use the browser terminal on this desktop too, to exercise the mobile path.")
      .addToggle((t) =>
        t.setValue(s.board.forceWebTerm).onChange(async (v) => {
          s.board.forceWebTerm = v;
          await this.save(false);
        }),
      );

    new Setting(containerEl)
      .setName("Force daemon steer")
      .setDesc("Steer through the daemon on this desktop too, to exercise the mobile path.")
      .addToggle((t) =>
        t.setValue(s.board.forceDaemonSteer).onChange(async (v) => {
          s.board.forceDaemonSteer = v;
          await this.save(false);
        }),
      );

    // --- ask: the tap-don't-type loop -------------------------------------
    new Setting(containerEl).setName("Ask loop").setHeading();

    new Setting(containerEl)
      .setName("Enable ask loop")
      .setDesc("Poll po-broker for pending tap-cards and surface them.")
      .addToggle((t) =>
        t.setValue(s.ask.askLoop).onChange(async (v) => {
          s.ask.askLoop = v;
          await this.save(false, true);
        }),
      );

    new Setting(containerEl)
      .setName("Broker URL")
      .setDesc("po-broker base, e.g. https://mac-mini.tail1fd1c8.ts.net:7890/po")
      .addText((t) =>
        t
          .setPlaceholder("https://mac-mini.tail1fd1c8.ts.net:7890/po")
          .setValue(s.ask.brokerUrl)
          .onChange(async (v) => {
            s.ask.brokerUrl = v.trim();
            await this.save(false, true);
          }),
      );

    new Setting(containerEl)
      .setName("Poll interval (ms)")
      .setDesc("How often to poll GET /po/pending. Default 2000.")
      .addText((t) =>
        t.setValue(String(s.ask.askPollMs)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 250) {
            s.ask.askPollMs = n;
            await this.save(false, true);
          }
        }),
      );

    // --- term: the embedded terminal --------------------------------------
    new Setting(containerEl).setName("Terminal").setHeading();

    new Setting(containerEl)
      .setName("WebSocket URL")
      .setDesc("ttyd/websocket terminal front, e.g. wss://mac-mini.tail1fd1c8.ts.net:7890")
      .addText((t) =>
        t
          .setPlaceholder("wss://mac-mini.tail1fd1c8.ts.net:7890")
          .setValue(s.term.wsUrl)
          .onChange(async (v) => {
            s.term.wsUrl = v.trim();
            await this.save(false);
          }),
      );

    new Setting(containerEl)
      .setName("Session label")
      .setDesc("tmux session the terminal attaches to (`tmux new -A -s <label>`).")
      .addText((t) =>
        t.setValue(s.term.sessionLabel).onChange(async (v) => {
          s.term.sessionLabel = v.trim();
          await this.save(false);
        }),
      );

    new Setting(containerEl)
      .setName("Auth token")
      .setDesc("Bearer for the terminal websocket front.")
      .addText((t) => {
        t.setValue(s.term.authToken).onChange(async (v) => {
          s.term.authToken = v.trim();
          await this.save(false);
        });
        t.inputEl.type = "password";
        t.inputEl.autocomplete = "off";
      });

    new Setting(containerEl)
      .setName("Canvas renderer")
      .setDesc("xterm.js canvas renderer. Leave OFF on broken-GPU boxes (webgl blanks the pane).")
      .addToggle((t) =>
        t.setValue(s.term.useCanvasRenderer).onChange(async (v) => {
          s.term.useCanvasRenderer = v;
          await this.save(false);
        }),
      );

    new Setting(containerEl)
      .setName("Show key bar")
      .setDesc("On-screen key bar (iPad: Esc/Tab/Ctrl/arrows).")
      .addToggle((t) =>
        t.setValue(s.term.showKeyBar).onChange(async (v) => {
          s.term.showKeyBar = v;
          await this.save(false, false, true);
        }),
      );

    new Setting(containerEl)
      .setName("Copy on select")
      .setDesc("Copy text to the clipboard the moment it is selected in the terminal.")
      .addToggle((t) =>
        t.setValue(s.term.copyOnSelect).onChange(async (v) => {
          s.term.copyOnSelect = v;
          await this.save(false);
        }),
      );

    new Setting(containerEl)
      .setName("Font size")
      .setDesc("Terminal font size in px. Default 14.")
      .addText((t) =>
        t.setValue(String(s.term.fontSize)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 6 && n <= 48) {
            s.term.fontSize = n;
            await this.save(false, false, true);
          }
        }),
      );
  }
}
