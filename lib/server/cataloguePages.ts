import "server-only";
import { createHash } from "node:crypto";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { fromDbProduct } from "@/lib/arenaStore";
import { CATALOGUE_REFRESH_SECONDS, catalogueProducts, type CataloguePage } from "@/lib/cataloguePages";
import { SEED_PRODUCTS } from "@/lib/mockData";
import { DB_PREFIX, publicArenaTable, supabase } from "@/lib/supabaseClient";
import { isVisibleProduct } from "@/lib/productSafety";
import { CATALOGUE_SECONDS, CATALOGUE_TAG } from "./cachePolicy";
import { withPublicImageUrls } from "./productImages";

// Public cards and discovery ranking share these columns. Full profiles and
// original edit/upload values are loaded separately by their existing routes.
const columns = ["id", "title", "tagline", "url", "maker_name", "maker_twitter", "maker_avatar", "logo",
  "submitted_at", "published_at", "category", "queue_status", "arena_enqueued", "arena_enqueued_at",
  "votes_count", "qualified_impressions", "last_exposed_at", "exposure_status", "discovery_boost_until",
  "moderation_status", "link_trust"].map(column => DB_PREFIX + column).join(",");
const pageSize = 96;

async function loadPage(after: string): Promise<CataloguePage> {
  if (!supabase) return { products: [], next: null, etag: "" };
  const id = DB_PREFIX + "id";
  const database = supabase;
  function fetchRows() {
    let query = database.from(publicArenaTable("products")).select(columns).order(id).limit(pageSize + 1);
    if (after) query = query.gt(id, after);
    return query.abortSignal(AbortSignal.timeout(8000));
  }
  let response = await fetchRows();
  if (response.error && /fetch failed|timeout|aborted|network/i.test(response.error.message)) response = await fetchRows();
  const { data, error } = response;
  if (error || !data) throw new Error("Public product catalogue unavailable.");
  const products = data.slice(0, pageSize).map(row => withPublicImageUrls(fromDbProduct(row as unknown as Record<string, unknown>)));
  const next = data.length > pageSize ? products[products.length - 1].id : null;
  const hash = createHash("sha256").update(JSON.stringify([products, next])).digest("base64url");
  return { products, next, etag: '"' + hash + '"', fetchedAt: Date.now() };
}

// Browser polling and ISR have separate freshness budgets. Both expire on publication or moderation.
export const getCataloguePage = unstable_cache(loadPage, ["live-card-page-v1"], { revalidate: CATALOGUE_REFRESH_SECONDS, tags: [CATALOGUE_TAG] });
const getInitialPage = unstable_cache(loadPage, ["initial-card-page-v1"], { revalidate: CATALOGUE_SECONDS, tags: [CATALOGUE_TAG] });

export const getCataloguePages = cache(async () => {
  const pages: CataloguePage[] = [];
  let cursor = "";
  do {
    const page = await getInitialPage(cursor);
    pages.push(page);
    cursor = page.next ?? "";
  } while (cursor);
  return pages;
});

export async function initialCataloguePages() {
  try { return await getCataloguePages(); }
  catch {
    const fallback = process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build";
    return fallback ? [{ products: SEED_PRODUCTS, next: null, etag: "" }] : [];
  }
}

export const getArenaProducts = cache(async () => {
  try { return catalogueProducts(await getCataloguePages()); }
  catch (error) {
    if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return SEED_PRODUCTS;
    throw error;
  }
});
export const getPublicProducts = cache(async () => (await getArenaProducts()).filter(isVisibleProduct));
