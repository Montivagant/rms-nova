/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true
  },
  transpilePackages: ["@nova/design-system"],
  compiler: {
    removeConsole: process.env.NODE_ENV === "production"
  },
  async rewrites() {
    const apiBase = process.env.API_BASE_URL ?? "http://localhost:3001";
    return [
      {
        source: "/v1/:path*",
        destination: `${apiBase}/v1/:path*`
      }
    ];
  }
};

export default nextConfig;
