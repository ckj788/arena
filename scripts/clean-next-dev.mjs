import { rm } from "node:fs/promises";

// Next.js can leave development-only route validators behind after a route is
// removed. They are not production artifacts and can otherwise break typecheck
// or build with references to files that no longer exist.
await rm(new URL("../.next/dev", import.meta.url), { recursive: true, force: true });
