import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server build for the Docker image.
  output: "standalone",
  /* config options here */
  // Lets phones on the same Wi-Fi open the dev server.
  allowedDevOrigins: ["192.168.*.*", "172.20.*.*"],
  // Hide the dev-only badge that overlaps the bottom bar.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
