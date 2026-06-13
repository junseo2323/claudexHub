/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native + heavy modules must run in Node, not be bundled by the server build.
  serverExternalPackages: ["better-sqlite3", "sqlite-vec", "@xenova/transformers"],
  // The reused `src/` domain layer is ESM TypeScript that imports with `.js`
  // specifiers (NodeNext style). Map `.js` -> `.ts` so the bundler resolves them.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
