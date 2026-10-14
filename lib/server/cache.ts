import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";
import { ARENA_TAG, CATALOGUE_TAG, CHAMPIONS_TAG, PRODUCT_ACTIVITY_TAG, VERSUS_TAG, productActivityTag, versusTag } from "./cachePolicy";

export function invalidateProductCatalogue(productId: string) {
  // Route handlers need immediate expiry so a newly submitted product does not
  // receive a cached 404 or an old catalogue on its first visit.
  revalidateTag(CATALOGUE_TAG, { expire: 0 });
  revalidatePath(`/products/${encodeURIComponent(productId)}`);
}

export function invalidateArenaVote(productAId: string, productBId: string) {
  revalidateTag(ARENA_TAG, { expire: 0 });
  for (const id of new Set([productAId, productBId])) {
    revalidateTag(productActivityTag(id), { expire: 0 });
  }
  for (const slug of [`${productAId}-vs-${productBId}`, `${productBId}-vs-${productAId}`]) {
    revalidateTag(versusTag(slug), { expire: 0 });
  }
}

export function invalidateArenaState() {
  // A queue/round transition changes catalogue queue status, recorded matchups
  // and possibly the winner list. It does not invalidate editorial articles.
  revalidateTag(CATALOGUE_TAG, { expire: 0 });
  revalidateTag(ARENA_TAG, { expire: 0 });
  revalidateTag(CHAMPIONS_TAG, { expire: 0 });
  revalidateTag(PRODUCT_ACTIVITY_TAG, { expire: 0 });
  revalidateTag(VERSUS_TAG, { expire: 0 });
  revalidatePath("/arena");
}

export function invalidateProductModeration(productId: string) {
  // Restricted products must disappear from all cached public projections,
  // including recorded opponents. Expire those data tags without purging the
  // root layout, private consoles, or static resource guides.
  invalidateProductCatalogue(productId);
  revalidateTag(ARENA_TAG, { expire: 0 });
  revalidateTag(CHAMPIONS_TAG, { expire: 0 });
  revalidateTag(PRODUCT_ACTIVITY_TAG, { expire: 0 });
  revalidateTag(VERSUS_TAG, { expire: 0 });
}
