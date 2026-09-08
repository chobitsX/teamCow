import { resolve } from "node:path"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@db": resolve(__dirname, "../../packages/db/src/index.ts"),
      "@renderer": resolve(__dirname, "src/renderer"),
      "@shared": resolve(__dirname, "../../packages/shared-types/src")
    }
  },
  test: {
    // Integration tests spawn Git and provider processes; bound contention on shared CI runners.
    maxWorkers: process.env.CI ? 2 : undefined,
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/renderer/test/setup.ts"]
  }
})
