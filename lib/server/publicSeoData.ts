import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { fetchCloudProducts, fromDbProduct } from "@/lib/arenaStore";
import { Product, SEED_PRODUCTS } from "@/lib/mockData";
import { DB_PREFIX, publicArenaTable, supabase } from "@/lib/supabaseClient";

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
  const { data, error } = await supabase.from(publicArenaTable("products"))
    .select("*").order(`${DB_PREFIX}submitted_at`, { ascending: true });
  // Do not persist an offline fallback as a successful empty catalogue. An
  // unsuccessful revalidation must preserve the last successful cached value.
  if (error || !data) throw new Error("Public products are temporarily unavailable.");
  return data.map(fromDbProduct);
}, ["arena-public-products-v2"], {
  revalidate: 60,
  tags: ["arena-public"],
});

export const getPublicProducts = cache(loadPublicProducts);

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

const loadProductSeoData = unstable_cache(async (rawSlug: string): Promise<ProductSeoData | null> => {
  const slug = rawSlug.toLowerCase();
  if (!SAFE_ID.test(slug)) return null;

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

  const [products, { data: matchRows, error: matchError }] = await Promise.all([
    getPublicProducts(),
    supabase
      .from(publicArenaTable("matches"))
      .select(matchFields)
      .or(`${DB_PREFIX}product_a_id.eq.${slug},${DB_PREFIX}product_b_id.eq.${slug}`)
      .limit(50),
  ]);

  if (matchError) throw new Error(`Unable to load product matchups: ${matchError.message}`);
  const product = products.find((item) => item.id.toLowerCase() === slug);
  if (!product) return null;

  const matches = ((matchRows ?? []) as unknown as DatabaseRow[]).map(mapMatch);
  const { data: critiqueRows, error: critiqueError } = matches.length
    ? await supabase
        .from(publicArenaTable("votes"))
        .select("*")
        .in(`${DB_PREFIX}match_id`, matches.map((match) => match.id))
        .order(`${DB_PREFIX}created_at`, { ascending: false })
        .limit(50)
    : { data: [], error: null };

  if (critiqueError) throw new Error(`Unable to load critiques: ${critiqueError.message}`);

  const opponents = new Map(
    products.map((item) => [item.id, item] as const),
  );
  const relatedProducts = products
    .filter((item) => item.id !== product.id)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    .slice(0, 6);

  const critiques = ((critiqueRows ?? []) as DatabaseRow[]).flatMap((row): PublicCritique[] => {
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
}, ["arena-product-seo-v2"], { revalidate: 1800, tags: ["arena-public"] });

export const getProductSeoData = cache(loadProductSeoData);

const loadVersusSeoData = unstable_cache(async (rawSlug: string): Promise<VersusSeoData | null> => {
  const slug = rawSlug.toLowerCase();
  const candidates = versusCandidates(slug);
  if (!supabase || candidates.length === 0) return null;

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
    const { data, error } = await supabase
      .from(publicArenaTable("matches"))
      .select(matchFields)
      .or(filter)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Unable to load matchup: ${error.message}`);
    if (data) {
      match = mapMatch(data as unknown as DatabaseRow);
      break;
    }
  }

  if (!match) return null;

  const [{ data: productRows, error: productError }, { data: critiqueRows, error: critiqueError }] = await Promise.all([
    supabase
      .from(publicArenaTable("products"))
      .select("*")
      .in(`${DB_PREFIX}id`, [match.productAId, match.productBId]),
    supabase
      .from(publicArenaTable("votes"))
      .select("*")
      .eq(`${DB_PREFIX}match_id`, match.id)
      .order(`${DB_PREFIX}created_at`, { ascending: false })
      .limit(30),
  ]);

  if (productError) throw new Error(`Unable to load matchup products: ${productError.message}`);
  if (critiqueError) throw new Error(`Unable to load matchup critiques: ${critiqueError.message}`);

  const products = new Map(
    (productRows ?? []).map((row) => {
      const product = fromDbProduct(row);
      return [product.id, product] as const;
    }),
  );
  const productA = products.get(match.productAId);
  const productB = products.get(match.productBId);
  if (!productA || !productB) return null;

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
}, ["arena-versus-seo-v2"], { revalidate: 1800, tags: ["arena-public"] });

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
      .range(start, start + pageSize - 1);
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
      .range(start, start + pageSize - 1);
    if (error || !data) throw new Error(`Unable to build matchup sitemap: ${error?.message || "Missing response"}`);
    matchRows.push(...((data ?? []) as unknown as DatabaseRow[]));
    if (!data || data.length < pageSize) break;
  }

  return {
    products: productRows.flatMap((row): SitemapProduct[] => {
      const id = stringValue(row, `${DB_PREFIX}id`);
      if (!id || !SAFE_ID.test(id)) return [];
      return [{
        id,
        submittedAt: stringValue(row, `${DB_PREFIX}submitted_at`) || undefined,
        updatedAt: stringValue(row, `${DB_PREFIX}updated_at`) || undefined,
        category: stringValue(row, `${DB_PREFIX}category`) || undefined,
      }];
    }),
    matches: matchRows.map(mapMatch).filter((match) =>
      Boolean(match.id && SAFE_ID.test(match.productAId) && SAFE_ID.test(match.productBId)),
    ),
  };
}

// The sitemap route owns the complete ISR snapshot. A second stale-while-
// revalidate cache here could turn an old dataset into a newly cached XML after
// submission, delaying new URLs for another hour. Regenerate from fresh records
// and let a failed query preserve the route's last successful snapshot instead.
export const getSitemapRecords = loadSitemapRecords;
