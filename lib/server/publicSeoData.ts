import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { fetchCloudProducts, fromDbProduct } from "@/lib/arenaStore";
import { Product, SEED_PRODUCTS } from "@/lib/mockData";
import { DB_PREFIX, publicArenaTable, supabase } from "@/lib/supabaseClient";
import { isVisibleProduct } from "@/lib/productSafety";
import { withPublicImageUrls } from "./productImages";
import { CATALOGUE_SECONDS, CATALOGUE_TAG, PRODUCT_ACTIVITY_TAG, SEO_SECONDS, VERSUS_TAG, productActivityTag, versusTag } from "./cachePolicy";

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,99}$/i;

type DatabaseRow = Record<string, unknown>;

export interface PublicMatch {
  id: string;
  bracketId: string;
  roundNumber: number;
  productAId: string;
  productBId: string;
  votesA: number;
  votesB: number;
  winnerId?: string;
}

export interface PublicCritique {
  id: string;
  voter: string;
  votedProductId: string;
  body: string;
  kind: "support" | "constructive";
  createdAt?: string;
}

export interface ProductMatchup {
  match: PublicMatch;
  opponent: Product;
}

export interface ProductSeoData {
  product: Product;
  critiques: PublicCritique[];
  matchups: ProductMatchup[];
  relatedProducts: Product[];
  wins: number;
}

export interface VersusSeoData {
  canonicalSlug: string;
  match: PublicMatch;
  productA: Product;
  productB: Product;
  critiques: Array<{
    id: string;
    voter: string;
    votedProductId: string;
    winnerFeedback: string;
    loserFeedback: string;
    createdAt?: string;
  }>;
}

export interface SitemapProduct {
  id: string;
  submittedAt?: string;
  updatedAt?: string;
  category?: string;
}

const loadPublicProducts = unstable_cache(async () => {
  if (!supabase) return fetchCloudProducts();
  let data: DatabaseRow[] | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await supabase.from(publicArenaTable("products"))
        .select("*").order(`${DB_PREFIX}submitted_at`, { ascending: true })
        .abortSignal(AbortSignal.timeout(8_000));
      if (response.error) {
        const transient = /fetch failed|timeout|aborted|network/i.test(response.error.message);
        if (attempt === 0 && transient) continue;
        if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") {
          console.warn("[INDIE CLASH] Supabase unavailable, falling back to seed products:", response.error.message);
          return SEED_PRODUCTS;
        }
        throw new Error(`Public products are temporarily unavailable: ${response.error.message}`);
      }
      data = response.data as unknown as DatabaseRow[] | null;
      break;
    } catch (error) {
      if (attempt === 1 || !/fetch failed|timeout|aborted|network/i.test(String(error))) {
        if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") {
          console.warn("[INDIE CLASH] Supabase network exception, falling back to seed products:", error);
          return SEED_PRODUCTS;
        }
        throw error;
      }
    }
  }
  // Do not persist an offline fallback as a successful empty catalogue. An
  // unsuccessful revalidation must preserve the last successful cached value.
  if (!data) {
    if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return SEED_PRODUCTS;
    throw new Error("Public products are temporarily unavailable.");
  }
  return data.map(row => withPublicImageUrls(fromDbProduct(row)));
}, ["arena-public-products-v3"], {
  revalidate: CATALOGUE_SECONDS,
  tags: [CATALOGUE_TAG],
});

export const getArenaProducts = cache(loadPublicProducts);
export const getPublicProducts = cache(async () => (await getArenaProducts()).filter(isVisibleProduct));

function stringValue(row: DatabaseRow, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function numberValue(row: DatabaseRow, key: string) {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mapMatch(row: DatabaseRow): PublicMatch {
  const winnerId = stringValue(row, `${DB_PREFIX}winner_id`);
  return {
    id: stringValue(row, `${DB_PREFIX}id`),
    bracketId: stringValue(row, `${DB_PREFIX}bracket_id`),
    roundNumber: numberValue(row, `${DB_PREFIX}round_number`),
    productAId: stringValue(row, `${DB_PREFIX}product_a_id`),
    productBId: stringValue(row, `${DB_PREFIX}product_b_id`),
    votesA: numberValue(row, `${DB_PREFIX}votes_a`),
    votesB: numberValue(row, `${DB_PREFIX}votes_b`),
    winnerId: winnerId || undefined,
  };
}

function seedProduct(slug: string) {
  return SEED_PRODUCTS.find((product) => product.id.toLowerCase() === slug.toLowerCase()) ?? null;
}

function versusCandidates(slug: string) {
  const candidates: Array<[string, string]> = [];
  const delimiter = "-vs-";
  let index = slug.indexOf(delimiter);

  while (index !== -1) {
    const productAId = slug.slice(0, index);
    const productBId = slug.slice(index + delimiter.length);
    if (SAFE_ID.test(productAId) && SAFE_ID.test(productBId)) {
      candidates.push([productAId, productBId]);
    }
    index = slug.indexOf(delimiter, index + delimiter.length);
  }

  return candidates;
}

export function matchSlug(match: Pick<PublicMatch, "productAId" | "productBId">) {
  return `${match.productAId}-vs-${match.productBId}`;
}

const loadProductSeoData = async (rawSlug: string): Promise<ProductSeoData | null> => {
  const slug = rawSlug.toLowerCase();
  if (!SAFE_ID.test(slug)) return null;

  return unstable_cache(async (): Promise<ProductSeoData | null> => {
    if (!supabase) {
      const product = seedProduct(slug);
      if (!product) return null;
      return {
        product,
        critiques: [],
        matchups: [],
        relatedProducts: SEED_PRODUCTS.filter((item) => item.id !== product.id).slice(0, 6),
        wins: 0,
      };
    }

    const matchFields = [
      `${DB_PREFIX}id`,
      `${DB_PREFIX}bracket_id`,
      `${DB_PREFIX}round_number`,
      `${DB_PREFIX}product_a_id`,
      `${DB_PREFIX}product_b_id`,
      `${DB_PREFIX}votes_a`,
      `${DB_PREFIX}votes_b`,
      `${DB_PREFIX}winner_id`,
    ].join(",");

    const products = await getPublicProducts();
    const listedProduct = products.find((item) => item.id.toLowerCase() === slug);
    if (!listedProduct) return null;
    // The catalogue has an independent lifetime. A targeted vote invalidation
    // must still refresh this product's vote total and peer-feedback boost.
    let product: Product | null = null;
    const { data: productRow, error: productError } = await supabase
      .from(publicArenaTable("products")).select("*")
      .eq(`${DB_PREFIX}id`, listedProduct.id).abortSignal(AbortSignal.timeout(8_000)).maybeSingle();
    if (productError) {
      if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") {
        console.warn(`[INDIE CLASH] Supabase unavailable for product ${listedProduct.id}, using catalogue snapshot:`, productError.message);
        product = listedProduct;
      } else {
        throw new Error(`Unable to load product: ${productError.message}`);
      }
    } else if (productRow) {
      product = withPublicImageUrls(fromDbProduct(productRow));
    }
    if (!product || !isVisibleProduct(product)) return null;

    // Arena history is supplemental. A temporary failure there must not hide a
    // published product, its website link, or its canonical metadata.
    let matchRows: DatabaseRow[] = [];
    try {
      const { data, error } = await supabase
        .from(publicArenaTable("matches"))
        .select(matchFields)
        .or(`${DB_PREFIX}product_a_id.eq.${slug},${DB_PREFIX}product_b_id.eq.${slug}`)
        .limit(50).abortSignal(AbortSignal.timeout(5_000));
      if (error) throw error;
      matchRows = (data ?? []) as unknown as DatabaseRow[];
    } catch (error) {
      console.warn(`[INDIE CLASH] Product matchups temporarily unavailable for ${slug}:`, error);
    }

    const matches = matchRows.map(mapMatch);
    let critiqueRows: DatabaseRow[] = [];
    if (matches.length) {
      try {
        const { data, error } = await supabase
          .from(publicArenaTable("votes"))
          .select("*")
          .in(`${DB_PREFIX}match_id`, matches.map((match) => match.id))
          .order(`${DB_PREFIX}created_at`, { ascending: false })
          .limit(50).abortSignal(AbortSignal.timeout(5_000));
        if (error) throw error;
        critiqueRows = (data ?? []) as unknown as DatabaseRow[];
      } catch (error) {
        console.warn(`[INDIE CLASH] Product critiques temporarily unavailable for ${slug}:`, error);
      }
    }

    const opponents = new Map(
      products.map((item) => [item.id, item] as const),
    );
    const relatedProducts = products
      .filter((item) => item.id !== product.id)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
      .slice(0, 6);

    const critiques = critiqueRows.flatMap((row): PublicCritique[] => {
      const votedProductId = stringValue(row, `${DB_PREFIX}voted_product_id`);
      const supported = votedProductId === product.id;
      const body = stringValue(
        row,
        supported ? `${DB_PREFIX}feedback_winner` : `${DB_PREFIX}feedback_loser`,
      ).trim();
      if (!body) return [];
      return [{
        id: stringValue(row, `${DB_PREFIX}id`),
        voter: stringValue(row, `${DB_PREFIX}voter_username`) || "Verified builder",
        votedProductId,
        body,
        kind: supported ? "support" : "constructive",
        createdAt: stringValue(row, `${DB_PREFIX}created_at`) || undefined,
      }];
    });

    return {
      product,
      critiques,
      matchups: matches.flatMap((match): ProductMatchup[] => {
        const opponentId = match.productAId === product.id ? match.productBId : match.productAId;
        const opponent = opponents.get(opponentId);
        return opponent ? [{ match, opponent }] : [];
      }),
      relatedProducts,
      wins: matches.filter((match) => match.winnerId === product.id).length,
    };
  }, ["arena-product-seo-v4", slug], {
    revalidate: SEO_SECONDS,
    tags: [CATALOGUE_TAG, PRODUCT_ACTIVITY_TAG, productActivityTag(slug)],
  })();
};

export const getProductSeoData = cache(loadProductSeoData);

const loadVersusSeoData = async (rawSlug: string): Promise<VersusSeoData | null> => {
  const slug = rawSlug.toLowerCase();
  const candidates = versusCandidates(slug);
  if (!supabase || candidates.length === 0) return null;
  const client = supabase;

  return unstable_cache(async (): Promise<VersusSeoData | null> => {
    const matchFields = [
      `${DB_PREFIX}id`,
      `${DB_PREFIX}bracket_id`,
      `${DB_PREFIX}round_number`,
      `${DB_PREFIX}product_a_id`,
      `${DB_PREFIX}product_b_id`,
      `${DB_PREFIX}votes_a`,
      `${DB_PREFIX}votes_b`,
      `${DB_PREFIX}winner_id`,
    ].join(",");

    let match: PublicMatch | null = null;
    for (const [candidateA, candidateB] of candidates) {
      const filter = [
        `and(${DB_PREFIX}product_a_id.eq.${candidateA},${DB_PREFIX}product_b_id.eq.${candidateB})`,
        `and(${DB_PREFIX}product_a_id.eq.${candidateB},${DB_PREFIX}product_b_id.eq.${candidateA})`,
      ].join(",");
      const { data, error } = await client
        .from(publicArenaTable("matches"))
        .select(matchFields)
        .or(filter)
        .limit(1)
        .abortSignal(AbortSignal.timeout(15_000))
        .maybeSingle();
      if (error) throw new Error(`Unable to load matchup: ${error.message}`);
      if (data) {
        match = mapMatch(data as unknown as DatabaseRow);
        break;
      }
    }

    if (!match) return null;

    const [{ data: productRows, error: productError }, { data: critiqueRows, error: critiqueError }] = await Promise.all([
      client
        .from(publicArenaTable("products"))
        .select("*")
        .in(`${DB_PREFIX}id`, [match.productAId, match.productBId]).abortSignal(AbortSignal.timeout(15_000)),
      client
        .from(publicArenaTable("votes"))
        .select("*")
        .eq(`${DB_PREFIX}match_id`, match.id)
        .order(`${DB_PREFIX}created_at`, { ascending: false })
        .limit(30).abortSignal(AbortSignal.timeout(15_000)),
    ]);

    if (productError) throw new Error(`Unable to load matchup products: ${productError.message}`);
    if (critiqueError) throw new Error(`Unable to load matchup critiques: ${critiqueError.message}`);

    const products = new Map(
      (productRows ?? []).map((row) => {
        const product = withPublicImageUrls(fromDbProduct(row));
        return [product.id, product] as const;
      }),
    );
    const productA = products.get(match.productAId);
    const productB = products.get(match.productBId);
    if (!productA || !productB || !isVisibleProduct(productA) || !isVisibleProduct(productB)) return null;

    return {
      canonicalSlug: matchSlug(match),
      match,
      productA,
      productB,
      critiques: ((critiqueRows ?? []) as DatabaseRow[]).map((row) => ({
        id: stringValue(row, `${DB_PREFIX}id`),
        voter: stringValue(row, `${DB_PREFIX}voter_username`) || "Verified builder",
        votedProductId: stringValue(row, `${DB_PREFIX}voted_product_id`),
        winnerFeedback: stringValue(row, `${DB_PREFIX}feedback_winner`),
        loserFeedback: stringValue(row, `${DB_PREFIX}feedback_loser`),
        createdAt: stringValue(row, `${DB_PREFIX}created_at`) || undefined,
      })),
    };
  }, ["arena-versus-seo-v3", slug], {
    revalidate: SEO_SECONDS,
    tags: [CATALOGUE_TAG, VERSUS_TAG, versusTag(slug)],
  })();
};

export const getVersusSeoData = cache(loadVersusSeoData);

async function loadSitemapRecords(): Promise<{
  products: SitemapProduct[];
  matches: PublicMatch[];
}> {
  if (!supabase) throw new Error("Sitemap database is not configured.");

  const pageSize = 1_000;
  const productRows: DatabaseRow[] = [];
  const matchRows: DatabaseRow[] = [];

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from(publicArenaTable("products"))
      .select("*")
      .order(`${DB_PREFIX}id`, { ascending: true })
      .range(start, start + pageSize - 1).abortSignal(AbortSignal.timeout(15_000));
    if (error || !data) throw new Error(`Unable to build product sitemap: ${error?.message || "Missing response"}`);
    productRows.push(...((data ?? []) as unknown as DatabaseRow[]));
    if (!data || data.length < pageSize) break;
  }

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from(publicArenaTable("matches"))
      .select([
        `${DB_PREFIX}id`,
        `${DB_PREFIX}bracket_id`,
        `${DB_PREFIX}round_number`,
        `${DB_PREFIX}product_a_id`,
        `${DB_PREFIX}product_b_id`,
        `${DB_PREFIX}votes_a`,
        `${DB_PREFIX}votes_b`,
        `${DB_PREFIX}winner_id`,
      ].join(","))
      .order(`${DB_PREFIX}id`, { ascending: true })
      .range(start, start + pageSize - 1).abortSignal(AbortSignal.timeout(15_000));
    if (error || !data) throw new Error(`Unable to build matchup sitemap: ${error?.message || "Missing response"}`);
    matchRows.push(...((data ?? []) as unknown as DatabaseRow[]));
    if (!data || data.length < pageSize) break;
  }

  const visibleIds = new Set(productRows.filter(row => row[`${DB_PREFIX}moderation_status`] !== "restricted").map(row => stringValue(row, `${DB_PREFIX}id`)));
  return {
    products: productRows.flatMap((row): SitemapProduct[] => {
      const id = stringValue(row, `${DB_PREFIX}id`);
      if (!id || !SAFE_ID.test(id) || !visibleIds.has(id)) return [];
      return [{
        id,
        submittedAt: stringValue(row, `${DB_PREFIX}submitted_at`) || undefined,
        updatedAt: stringValue(row, `${DB_PREFIX}updated_at`) || undefined,
        category: stringValue(row, `${DB_PREFIX}category`) || undefined,
      }];
    }),
    matches: matchRows.map(mapMatch).filter((match) =>
      Boolean(match.id && SAFE_ID.test(match.productAId) && SAFE_ID.test(match.productBId) && visibleIds.has(match.productAId) && visibleIds.has(match.productBId)),
    ),
  };
}

// The dynamic sitemap route reads all public records without a second data cache.
// Query failures propagate; do not turn them into a successful partial catalogue.
export const getSitemapRecords = loadSitemapRecords;
