import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This machine has multiple lockfiles; pin Turbopack's root to this project.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
