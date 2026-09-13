import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The "@/" alias is declared in tsconfig.json, but relying on Next to read it there has
  // proven environment-dependent: the same commit resolved it locally and failed on Vercel
  // with "Can't resolve '@/components/ui'". Declaring it against this file's own directory
  // removes the ambiguity — it cannot depend on the working directory or on how tsconfig
  // paths are interpreted.
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, "@": join(here, "src") };
    return config;
  },
  // Workspace packages ship TypeScript source rather than a build artifact, so Next
  // compiles them alongside the app. Keeps the data layer free of a build step.
  transpilePackages: ["@elections26/data", "@elections26/schema"],
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
