/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the Docker runner
  // ships only the traced files it needs — no full node_modules copy, no
  // `npm prune`. Much smaller image + faster final build stage.
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.s3.eu-west-2.amazonaws.com",
      },
    ],
  },
  serverExternalPackages: ["pg"],
};

export default nextConfig;
