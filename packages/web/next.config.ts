import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const config: NextConfig = {
  // @morrel/core uses node:sqlite; keep it out of the bundle and load it at runtime on the server.
  serverExternalPackages: ["@morrel/core"],
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  poweredByHeader: false,
};

export default config;
