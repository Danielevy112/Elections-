/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship TypeScript source rather than a build artifact, so Next
  // compiles them alongside the app. Keeps the data layer free of a build step.
  transpilePackages: ["@elections26/data", "@elections26/schema"],
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
