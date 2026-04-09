import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "src/main/index.ts",
    preload: "src/preload/index.ts",
  },
  format: ["cjs"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  external: ["electron", "oracledb"],
  // Embute workspace packages no bundle — elimina conflito ESM/CJS
  // oracledb fica external porque é nativo (C++ bindings no modo Thick)
  noExternal: ["@gavadb/ipc-contract", "@gavadb/types", "@gavadb/oracle"],
});
