import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Tests default to the deterministic noop embedding provider so CI needs
    // no model download and no network.
    env: {
      EMBEDDING_PROVIDER: "noop",
      HUB_DB_PATH: ":memory:",
    },
  },
});
