// esbuild loads .css as a text string (see esbuild.config.mjs `loader`). tsc needs
// the ambient module so `import xtermCss from "@xterm/xterm/css/xterm.css"` type-checks.
declare module "*.css" {
  const content: string;
  export default content;
}
