import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // Keep the approved V7 local art/font URLs. API routes are always dynamic.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};
export default config;
