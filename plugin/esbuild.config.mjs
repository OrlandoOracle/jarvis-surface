import esbuild from "esbuild";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // xterm ships CSS; esbuild inlines it as a text string, which the terminal view
  // injects once at runtime via ensureXtermCss() (works on mobile — no build-step
  // styles.css concat needed).
  loader: { ".css": "text" },
  // `obsidian` and node builtins are provided by the host, never bundled.
  // builtin-modules lists bare names only; Obsidian code uses the node: prefix too.
  external: ["obsidian", "electron", ...builtins, ...builtins.map((m) => `node:${m}`)],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  platform: "browser",
});

if (production) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
