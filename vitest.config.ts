import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig(async () => {
  const { default: react } = await import("@vitejs/plugin-react");
  return {
    plugins: [react()],
    test: {
      globals: true,
      environmentMatchGlobs: [["__tests__/components/**", "jsdom"]],
      include: ["__tests__/**/*.test.{ts,tsx}"],
      setupFiles: ["__tests__/setup.ts"],
    },
    resolve: {
      alias: { "@": resolve(__dirname, ".") },
    },
  };
});
