import type { GavaDbApi } from "@gavadb/ipc-contract";

declare global {
  interface Window {
    gavadb: GavaDbApi;
  }
}
