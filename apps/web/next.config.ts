import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Let phones/laptops on the same Wi-Fi load the dev server via this
// machine's LAN IP (Next.js blocks unknown dev origins by default).
const lanIps = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal)
  .map((n) => n!.address);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: lanIps,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
