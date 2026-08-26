import { resolve } from "node:path"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  main: {
    resolve: {
      alias: {
        "@db": resolve(__dirname, "../../packages/db/src/index.ts"),
        "@shared": resolve(__dirname, "../../packages/shared-types/src"),
        "@teamcow/i18n-resources": resolve(__dirname, "../../packages/i18n-resources/src/index.ts")
      }
    },
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts")
        }
      }
    },
    plugins: [externalizeDepsPlugin({ exclude: ["@teamcow/i18n-resources"] })]
  },
  preload: {
    resolve: {
      alias: {
        "@db": resolve(__dirname, "../../packages/db/src/index.ts"),
        "@shared": resolve(__dirname, "../../packages/shared-types/src")
      }
    },
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/preload/index.ts")
        }
      }
    }
  },
  renderer: {
    root: "src/renderer",
    server: {
      host: "127.0.0.1",
      strictPort: true
    },
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html")
        }
      }
    },
    resolve: {
      alias: {
        "@db": resolve(__dirname, "../../packages/db/src/index.ts"),
        "@renderer": resolve(__dirname, "src/renderer"),
        "@shared": resolve(__dirname, "../../packages/shared-types/src"),
        "@teamcow/i18n-resources": resolve(__dirname, "../../packages/i18n-resources/src/index.ts")
      }
    },
    plugins: [react()]
  }
})
