/** @type {import('next').NextConfig} */
const nextConfig = {
    basePath: "/auto-subs",
    output: "export", // Enables static exports
    reactStrictMode: true,
    images: { unoptimized: true }
};

module.exports = nextConfig;