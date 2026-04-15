import type { GavaDbApi } from "@gavadb/ipc-contract";

declare global {
  interface Window {
    gavadb: GavaDbApi;
  }
}

declare module "*.png" {
  const src: string;
  export default src;
}
