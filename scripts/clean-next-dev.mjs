import { rm } from "node:fs/promises";
import net from "node:net";

// Check if Next.js dev server is running
const isDevRunning = await new Promise((resolve) => {
  const socket = net.createConnection({ port: 3000, host: "127.0.0.1" });
  socket.once("connect", () => {
    socket.destroy();
    resolve(true);
  });
  socket.once("error", () => resolve(false));
});

// Next.js can leave development-only route validators behind after a route is
// removed. They are not production artifacts and can otherwise break typecheck
// or build with references to files that no longer exist.
// If dev server is running, only clean types to prevent Turbopack from restarting.
if (isDevRunning) {
  try {
    await rm(new URL("../.next/dev/types", import.meta.url), { recursive: true, force: true });
  } catch {}
} else {
  try {
    await rm(new URL("../.next/dev", import.meta.url), { recursive: true, force: true });
  } catch {}
}
