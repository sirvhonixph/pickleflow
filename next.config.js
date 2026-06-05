/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@vercel/blob"],
    outputFileTracingIncludes: {
      "/api/events/[id]": ["./data/**/*"],
      "/api/events": ["./data/**/*"],
      "/api/events/**": ["./data/**/*"],
    },
  },
};

module.exports = nextConfig;
