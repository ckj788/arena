import "server-only";

// Timers cover direct database edits; normal application writes invalidate tags.
export const CATALOGUE_SECONDS = 3600;
export const ARENA_SECONDS = 300;
export const SEO_SECONDS = 3600;
export const CATALOGUE_TAG = "arena-catalogue";
export const ARENA_TAG = "arena-bracket";
export const CHAMPIONS_TAG = "arena-champions";
export const PRODUCT_ACTIVITY_TAG = "arena-product-activity";
export const VERSUS_TAG = "arena-versus";

export const productActivityTag = (id: string) => `arena-product:${id.toLowerCase()}`;
export const versusTag = (slug: string) => `arena-versus:${slug.toLowerCase()}`;
