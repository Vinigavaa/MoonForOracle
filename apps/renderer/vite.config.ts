import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Base relativa para funcionar tanto no dev server quanto carregado via file:// no Electron
  base: "./",
  build: {
    outDir: "dist",
  },
});
