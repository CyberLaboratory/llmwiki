import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  // Accept any Host in `next dev` so the dev server responds to in-cluster
  // DNS names (svc.cluster.local, Pod IPs, etc.). Production `next start` does
  // not validate Host, so this only affects the dev path.
  allowedDevOrigins: ["*"],
};

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
});
