// Pure parser for a project's CONTINUE.md — the shared dashboard template's data source.
//
// The dashboard reads CONTINUE.md with `vault.adapter.read` (the one path that works on
// iOS, where there is no filesystem and the file arrives via LiveSync), then this turns
// the markdown into the handful of sections the modal renders: the frontmatter `status:`,
// the `## Decided` directions, the unchecked `## Next` items, and the `## Gates`. It is
// deliberately forgiving — a project with no CONTINUE.md, or a truncated one, yields an
// empty `ParsedContinue` rather than throwing, so the modal falls back to the daemon card.

export interface ParsedContinue {
  /** `status:` from the frontmatter, or "" if absent. */
  status: string;
  /** `## Decided` bullet lines, in document order (the binding directions). */
  decided: string[];
  /** Unchecked `- [ ]` items under `## Next`. */
  next: string[];
  /** `## Gates` bullet lines. */
  gates: string[];
}

export const EMPTY_CONTINUE: ParsedContinue = {
  status: "",
  decided: [],
  next: [],
  gates: [],
};

/** Split off a leading `---\n…\n---` frontmatter block; return [frontmatter, body]. */
function splitFrontmatter(md: string): [string, string] {
  if (!md.startsWith("---")) return ["", md];
  const end = md.indexOf("\n---", 3);
  if (end < 0) return ["", md];
  const fmEnd = md.indexOf("\n", end + 1);
  return [md.slice(3, end), md.slice(fmEnd < 0 ? md.length : fmEnd + 1)];
}

/** Pull `status:` out of the frontmatter. Only the first line of a folded value is kept
 *  — the picker's status is a single clause, and a multi-line YAML scalar would drag the
 *  whole dossier into the headline. */
function frontmatterStatus(fm: string): string {
  for (const line of fm.split("\n")) {
    const m = /^status:\s*(.*)$/.exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

/** Return the lines of the `## <name>` section body (up to the next `## ` / `# `). */
function sectionLines(body: string, name: string): string[] {
  const lines = body.split("\n");
  const out: string[] = [];
  let inSection = false;
  const head = new RegExp("^#{1,6}\\s+" + name + "\\s*$", "i");
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      if (inSection) break; // next heading ends the section
      inSection = head.test(line);
      continue;
    }
    if (inSection) out.push(line);
  }
  return out;
}

/** Bullet lines (`- `, `* `) in a section, trimmed of the marker. Checkbox items keep
 *  their `[ ]`/`[x]` so the caller can filter unchecked. */
function bullets(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const m = /^\s*[-*]\s+(.*)$/.exec(raw);
    if (m && m[1].trim()) out.push(m[1].trim());
  }
  return out;
}

export function parseContinue(md: string): ParsedContinue {
  if (!md || typeof md !== "string") return { ...EMPTY_CONTINUE };
  const [fm, body] = splitFrontmatter(md);
  const decided = bullets(sectionLines(body, "Decided"));
  const gates = bullets(sectionLines(body, "Gates"));
  const next = bullets(sectionLines(body, "Next"))
    // unchecked only: `[ ]` stays, `[x]`/`[X]` drops, plain bullets stay
    .filter((b) => !/^\[[xX]\]/.test(b))
    .map((b) => b.replace(/^\[\s?\]\s*/, "").trim())
    .filter(Boolean);
  return {
    status: frontmatterStatus(fm),
    decided,
    gates,
    next,
  };
}
