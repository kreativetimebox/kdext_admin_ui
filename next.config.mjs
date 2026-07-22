/** @type {import('next').NextConfig} */
const nextConfig = {
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
