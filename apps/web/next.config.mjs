/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@beatdrop/shared"],
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com" }] },
};
export default nextConfig;
