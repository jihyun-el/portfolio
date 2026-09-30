import type { NextConfig } from "next";
import { normalizeBasePath } from "./scripts/paths.mjs";

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: normalizeBasePath(process.env.PAGES_BASE_PATH || ""),
  images: { unoptimized: true },
  turbopack: { root: process.cwd() },
};

export default config;
