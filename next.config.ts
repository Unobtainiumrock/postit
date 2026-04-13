import type { NextConfig } from "next";

// next-pwa (v5) is CJS; require() it to avoid ESM interop complaints.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      // OG thumbnail images hosted on arbitrary origins
      urlPattern: /^https?:\/\/.*\.(?:png|jpg|jpeg|webp|avif|gif|svg)(?:\?.*)?$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "postit-thumbs",
        expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /^\/api\//,
      handler: "NetworkFirst",
      options: {
        cacheName: "postit-api",
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 64, maxAgeSeconds: 60 },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  // next-pwa injects webpack config; Next 16 defaults to Turbopack — empty config opts in explicitly.
  turbopack: {},
  images: {
    // OG images come from arbitrary origins; allow all https remote sources.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default withPWA(nextConfig);
