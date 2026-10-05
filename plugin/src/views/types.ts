// Ported verbatim from obsidian-session-modal/src/types.ts (2026-08-30).
// The payload shape is owned by `00-System/bin/sessions --json` (the zsh engine) and
// wrapped by `00-System/bin/sessions-daemon`. Nothing here re-derives any of it --
// the card renderer renders what it is handed, in the order it is handed it. Kept as
// its own module so `card.ts` ports unchanged (its `./types` import resolves here).

export type HostId = "mac" | "d2" | "d1";

/** Decision 14: four lanes, fixed, declared in CONTINUE.md frontmatter. */
export type Lane = "magic" | "insurance" | "build" | "personal";

/** A CONTINUE.md with no `lane:` lands here rather than disappearing. */
export const UNFILED = "unfiled" as const;
export type LaneKey = Lane | typeof UNFILED;

export const LANES: LaneKey[] = [
  "magic",
  "insurance",
  "build",
  "personal",
  UNFILED,
];

export const LANE_LABEL: Record<LaneKey, string> = {
  magic: "Magic",
  insurance: "Insurance",
  build: "Build",
  personal: "Personal",
  unfiled: "Unfiled",
};

export const LANE_BLURB: Record<LaneKey, string> = {
  magic: "Orlando Oracle — repertoire, show prep, Kong",
  insurance: "AFHC — team support, WAVV, pipeline",
  build: "The systems — vault tooling, Deborah, daemons",
  personal: "Health, relationships, learning, Foundation",
  unfiled: "No lane: in frontmatter — visible, and nagging",
};

export interface SessionRow {
  host: HostId;
  name: string;
  windows: number;
  attached: boolean;
  activity: number;
  /** Already-rendered relative time ("45s", "2h", "—"). The engine formats it. */
  ago: string;
  pane_title: string;
  status: string;
  /** The line to show under the name: pane title, else CONTINUE.md status. */
  note: string;
  pinned: boolean;
  /** false = a pinned desk that is not up. Picking it creates the session. */
  running: boolean;
}

/**
 * Decision 15: a live session is a BADGE on a project card, not a row of its own.
 * The join is `p/<slug>` <-> the project directory name.
 */
export interface SessionBadge {
  host: HostId;
  /** The tmux session name, i.e. `p/<slug>`. */
  name: string;
  ago: string;
  /** A client holds it -- somewhere. Decision 16 turns this into a prompt. */
  attached: boolean;
  /** Where, when the engine can tell. Free text; shown, never parsed. */
  attached_where?: string;
  /** Subtitle on live cards only -- deliberately NOT the card body. */
  pane_title: string;
}

/**
 * Cockpit status for a live Claude session, derived by
 * `00-System/bin/session-heartbeats` from the per-session beacons. The emitter
 * writes a raw hint; staleness, pane-death and the blocking-tool cases are resolved
 * there, so nothing is re-derived here.
 */
export type LiveStatus =
  | "needs-you"
  /**
   * Blocked on you, but you are AT that pane — a tmux client is attached and that
   * pane is the one on screen. Same underlying prompt as `needs-you`; the dot and
   * the alert channels are what change, because nagging you about a card you are
   * mid-answer is the thing that teaches you to ignore the board.
   */
  | "attending"
  | "stalled"
  | "active"
  | "idle"
  | "remote"
  | "ended";

/** Lower = wants more of your attention. The board's grouping order (answer #9). */
export const LIVE_RANK: Record<LiveStatus, number> = {
  "needs-you": 0,
  attending: 1,
  stalled: 2,
  active: 3,
  idle: 4,
  remote: 5,
  ended: 6,
};

export const LIVE_DOT: Record<LiveStatus, string> = {
  "needs-you": "●",
  // Filled, like needs-you, because it IS blocked — ringed, because it is held.
  attending: "◉",
  stalled: "▲",
  active: "●",
  idle: "○",
  remote: "◇",
  ended: "×",
};

export interface LiveSession {
  sid: string;
  slug: string;
  /** Raw `socket.gethostname()`. Use `host_key` for anything that branches. */
  host: string;
  host_key?: HostId;
  status: LiveStatus;
  state_raw: string;
  event: string;
  ago_s: number;
  /** "" when the session runs outside tmux -- the normal shape on the Mac. */
  pane: string;
  /**
   * Whether there is a live pane to `send-keys` into. False for a paneless session,
   * which the board must render monitor-only rather than offering an inject control
   * that would silently no-op.
   */
  injectable: boolean;
  title: string;
  /** How `status` was decided: the hook beacon, or the capture-pane fallback. */
  source: "heartbeat" | "capture";
  /**
   * The session was spawned with the PHI flag (`JARVIS_PHI=1`) — a PHI-touching pane
   * on the jarvis-phi-oracle surface. A bare routing boolean; it names no lead. The
   * board renders a 🔒 badge so a PHI session is recognisable at a glance. Absent on
   * beacons written before Unit 1 shipped, so treat undefined as not-PHI.
   */
  phi?: boolean;
}

export interface HostHealth {
  ok: boolean;
  count: number;
  local: boolean;
  /** Present only when `ok` is false -- the actual reason, shown in the banner. */
  error?: string;
}

export interface HeartbeatsInfo {
  generated_at: number;
  host: string;
  stale_s: number;
  /** Absent on a local-only scan, which knows nothing about the other boxes. */
  hosts?: Record<string, HostHealth>;
  /** Host keys that could not be reached. Never conflate with "no sessions". */
  degraded?: string[];
}

export interface ProjectCard {
  /** Directory name under `01-Projects/`. Also the `/resume` argument. */
  slug: string;
  lane: LaneKey;
  /** Card body: `status:` frontmatter, first clause. */
  status: string;
  /** First unchecked `- [ ]` under `## Next`, continuation lines joined. */
  next: string;
  /** `updated:` frontmatter -- the fallback badge on a cold card. */
  updated: string;
  /** Decision 17: where `p/<slug>` gets created. `host:` is prose and unusable. */
  create_on: HostId;
  /** Absolute project directory on `create_on`, for tmux `-c`. */
  dir: string;
  session: SessionBadge | null;
  /**
   * The needs-you layer, attached by `session-heartbeats --enrich`. `session` above
   * comes from `tmux list-sessions` and knows only THAT something is up; this knows
   * whether it is blocked on you. Null when no live Claude session maps to the slug.
   */
  live?: LiveSession | null;
}

export interface CacheInfo {
  ok: boolean;
  fetched_at?: number;
  age_seconds?: number;
  stale?: boolean;
  refresh_seconds?: number;
  error?: string | null;
}

export interface SessionsPayload {
  generated_at: number;
  filter: string;
  reachable: Record<HostId, boolean>;
  count: number;
  sessions: SessionRow[];
  /** Added by the daemon; absent when the engine was run locally as a fallback. */
  cache?: CacheInfo;
}

/** What `sessions --projects --json` will emit, and what fixtures stand in for. */
export interface ProjectsPayload {
  generated_at: number;
  reachable: Record<HostId, boolean>;
  count: number;
  /** Pre-ranked by the engine: live first, then by `updated`. Never re-sorted here. */
  projects: ProjectCard[];
  cache?: CacheInfo;
  /** Set only by the fixture source, so the surface can say it is not real. */
  fake?: boolean;
  /**
   * Live sessions that matched no project card. Shown as their own rows so nothing
   * runs unseen -- an untagged session is the one most likely to be forgotten.
   */
  unclaimed?: LiveSession[];
  heartbeats?: HeartbeatsInfo;
}
