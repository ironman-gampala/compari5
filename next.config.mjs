/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "impit",
    "impit-darwin-arm64",
    "impit-darwin-x64",
    "impit-linux-x64-gnu",
    "impit-linux-x64-musl",
    "impit-linux-arm64-gnu",
    "impit-win32-x64-msvc",
    "@modelcontextprotocol/sdk",
  ],
};

export default nextConfig;
