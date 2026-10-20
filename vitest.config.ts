import { defineConfig } from "vitest/config";

// Standalone from vite.config so tests don't load the React/Tailwind plugins.
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    css: { include: [/App\.css/] },
    include: ["src/**/*.test.ts"],
  },
});
