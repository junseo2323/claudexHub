import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli/index.ts"],
  format: ["esm"],
  target: "node20",
  dts: true,
  clean: true,
  sourcemap: true,
  tsconfig: "tsconfig.lib.json",
  // Executable bins need a shebang.
  banner: { js: "#!/usr/bin/env node" },
  // Native + heavy deps are loaded at runtime, not bundled.
  external: ["better-sqlite3", "sqlite-vec", "@huggingface/transformers"],
  // schema.sql is read from disk at runtime; ensure it ships alongside dist.
  onSuccess: "node -e \"require('fs').copyFileSync('src/db/schema.sql','dist/schema.sql')\"",
});
