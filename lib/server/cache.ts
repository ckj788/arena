import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

export function invalidateArenaPublic(paths: string[] = []) {
  revalidateTag("arena-public", "max");
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
  for (const path of paths) revalidatePath(path);
}
