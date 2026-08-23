import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  advanceTournamentRound,
  buildInitialBracket,
  fromDbMatch,
  fromDbProduct,
  getActiveRound,
  toDbMatch,
  toDbProduct,
} from "@/lib/arenaStore";
import type { Bracket, Match, Product } from "@/lib/mockData";
import { DB_PREFIX } from "@/lib/supabaseClient";
import { getMillisecondsToNextNYMidnight, getRoundRemainingMs } from "@/lib/timeHelpers";
import { getAdminClient, HttpError } from "./auth";

type DbRow = Record<string, unknown>;

function databaseError(context: string, error: { message: string; code?: string } | null): never {
  console.error(`[ARENA ADMIN] ${context}:`, error?.message || "Unknown database error");
  throw new HttpError(500, "The arena database operation failed.");
}

function normalizeSlug(urlString: string, title: string): string {
  try {
    const hostname = new URL(urlString).hostname.toLowerCase().replace(/^www\./, "");
    const parts = hostname.split(".").filter(Boolean);
    const first = parts[0] || "";
    const candidate = parts.length > 2 && ["app", "dev", "play", "get", "use", "try", "go", "my"].includes(first)
      ? parts[1]
      : first;
    const cleaned = candidate.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (cleaned) return cleaned;
  } catch {
    // The route validates URLs before this function is called.
  }

  return title
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || `product-${randomUUID().slice(0, 8)}`;
}

async function uniqueProductSlug(client: SupabaseClient, baseSlug: string): Promise<string> {
  let slug = baseSlug;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await client
      .from(`${DB_PREFIX}products`)
      .select(`${DB_PREFIX}id`)
      .eq(`${DB_PREFIX}id`, slug)
      .maybeSingle();
    if (error) databaseError("checking product slug", error);
    if (!data) return slug;
    slug = `${baseSlug}-${randomUUID().slice(0, 6)}`;
  }
  throw new HttpError(409, "Unable to allocate a unique product URL.");
}

export interface NewProductInput {
  title: string;
  tagline: string;
  url: string;
  shipTimeframe: Product["shipTimeframe"];
  makerName: string;
  makerTwitter: string;
  logo: string;
}

export async function createProductForUser(user: User, input: NewProductInput): Promise<Product> {
  const client = getAdminClient();
  const id = await uniqueProductSlug(client, normalizeSlug(input.url, input.title));
  const username = String(
    user.user_metadata?.preferred_username ||
      user.user_metadata?.user_name ||
      user.user_metadata?.full_name ||
      `member-${user.id.slice(0, 8)}`,
  );
  const avatarCandidate = String(user.user_metadata?.avatar_url || user.user_metadata?.picture || "");
  const makerAvatar = /^https:\/\//i.test(avatarCandidate)
    ? avatarCandidate
    : "https://www.indieclash.com/og-image.png";

  const product: Product = {
    id,
    title: input.title,
    tagline: input.tagline,
    url: input.url,
    shipTimeframe: input.shipTimeframe,
    makerName: input.makerName,
    makerTwitter: input.makerTwitter,
    makerAvatar,
    logo: input.logo,
    submittedAt: new Date().toISOString(),
    queueStatus: "waiting",
    votesCount: 0,
    creator_uid: user.id,
    creatorUsername: username,
    arenaEnqueued: false,
  };

  const { data, error } = await client
    .from(`${DB_PREFIX}products`)
    .insert(toDbProduct(product))
    .select("*")
    .single();
  if (error || !data) databaseError("creating product", error);
  return fromDbProduct(data);
}

export async function enqueueOwnedProduct(user: User, productId: string): Promise<boolean> {
  const client = getAdminClient();
  const { data: product, error: fetchError } = await client
    .from(`${DB_PREFIX}products`)
    .select("*")
    .eq(`${DB_PREFIX}id`, productId)
    .maybeSingle();
  if (fetchError) databaseError("loading product", fetchError);
  if (!product) throw new HttpError(404, "Product not found.");
  const productRow = product as unknown as DbRow;
  if (productRow[`${DB_PREFIX}creator_uid`] !== user.id) {
    throw new HttpError(403, "You do not own this product.");
  }
  if (productRow[`${DB_PREFIX}queue_status`] !== "waiting") {
    throw new HttpError(409, "Only waiting products can enter the arena queue.");
  }

  const { error: updateError } = await client
    .from(`${DB_PREFIX}products`)
    .update({ [`${DB_PREFIX}arena_enqueued`]: true })
    .eq(`${DB_PREFIX}id`, productId)
    .eq(`${DB_PREFIX}creator_uid`, user.id);
  if (updateError) databaseError("enqueueing product", updateError);

  return tryStartBracket(client);
}

async function fetchProducts(client: SupabaseClient): Promise<Product[]> {
  const { data, error } = await client
    .from(`${DB_PREFIX}products`)
    .select("*")
    .order(`${DB_PREFIX}submitted_at`, { ascending: true });
  if (error || !data) databaseError("loading products", error);
  return data.map(fromDbProduct);
}

async function fetchOpenBracket(client: SupabaseClient, products?: Product[]): Promise<Bracket | null> {
  const { data: bracketRow, error: bracketError } = await client
    .from(`${DB_PREFIX}brackets`)
    .select("*")
    .in(`${DB_PREFIX}status`, ["preparing", "active"])
    .order(`${DB_PREFIX}created_at`, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (bracketError) databaseError("loading active bracket", bracketError);
  if (!bracketRow) return null;

  const { data: matchRows, error: matchError } = await client
    .from(`${DB_PREFIX}matches`)
    .select("*")
    .eq(`${DB_PREFIX}bracket_id`, bracketRow[`${DB_PREFIX}id`]);
  if (matchError || !matchRows) databaseError("loading bracket matches", matchError);

  const allProducts = products || await fetchProducts(client);
  const productMap = new Map(allProducts.map((product) => [product.id, product]));
  const rounds: Record<number, Match[]> = { 1: [], 2: [], 3: [], 4: [] };

  for (const row of matchRows as DbRow[]) {
    const productA = productMap.get(String(row[`${DB_PREFIX}product_a_id`]));
    const productB = productMap.get(String(row[`${DB_PREFIX}product_b_id`]));
    const roundNumber = Number(row[`${DB_PREFIX}round_number`]);
    if (!productA || !productB || !rounds[roundNumber]) continue;
    rounds[roundNumber].push(fromDbMatch(row, productA, productB));
  }
  Object.values(rounds).forEach((matches) => matches.sort((a, b) => a.id.localeCompare(b.id)));

  return {
    id: String(bracketRow[`${DB_PREFIX}id`]),
    status: bracketRow[`${DB_PREFIX}status`] as Bracket["status"],
    winner: bracketRow[`${DB_PREFIX}winner_id`]
      ? productMap.get(String(bracketRow[`${DB_PREFIX}winner_id`]))
      : undefined,
    roundStartedAt: String(bracketRow[`${DB_PREFIX}round_started_at`] || ""),
    round1: rounds[1],
    round2: rounds[2],
    round3: rounds[3],
    round4: rounds[4],
  };
}

async function saveBracket(
  client: SupabaseClient,
  bracket: Bracket,
  pruneAfterRound: number | null = null,
): Promise<void> {
  const matches = [...bracket.round1, ...bracket.round2, ...bracket.round3, ...bracket.round4];
  const productIds = [...new Set(
    bracket.round1.flatMap((match) => [match.productA.id, match.productB.id]),
  )];
  const { error } = await client.rpc(`${DB_PREFIX}save_bracket_state`, {
    p_bracket: {
      id: bracket.id,
      status: bracket.status,
      winner_id: bracket.winner?.id || null,
      round_started_at: bracket.roundStartedAt || new Date().toISOString(),
    },
    p_matches: matches.map((match) => toDbMatch(match, bracket.id)),
    p_product_ids: productIds,
    p_product_status: bracket.status === "completed" ? "completed" : "active",
    p_prune_after_round: pruneAfterRound,
  });
  if (error) databaseError("saving bracket transaction", error);
}

async function tryStartBracket(client: SupabaseClient): Promise<boolean> {
  const openBracket = await fetchOpenBracket(client);
  if (openBracket) return false;

  const { data, error } = await client
    .from(`${DB_PREFIX}products`)
    .select("*")
    .eq(`${DB_PREFIX}queue_status`, "waiting")
    .eq(`${DB_PREFIX}arena_enqueued`, true)
    .order(`${DB_PREFIX}submitted_at`, { ascending: true })
    .limit(16);
  if (error || !data) databaseError("loading arena queue", error);
  if (data.length < 16) return false;

  const { bracket } = buildInitialBracket(data.map(fromDbProduct));
  try {
    await saveBracket(client, bracket);
    return true;
  } catch (error) {
    // A partial unique index permits only one preparing/active bracket. A concurrent
    // request that loses the race can safely reload the bracket created by the winner.
    const latest = await fetchOpenBracket(client);
    if (latest) return false;
    throw error;
  }
}

async function acquireSettlementLock(client: SupabaseClient, bracket: Bracket, token: string): Promise<boolean> {
  const { data, error } = await client.rpc(`${DB_PREFIX}acquire_settlement_lock`, {
    p_bracket_id: bracket.id,
    p_round_started_at: bracket.roundStartedAt,
    p_lock_token: token,
  });
  if (error) databaseError("acquiring settlement lock", error);
  return data === true;
}

async function releaseSettlementLock(client: SupabaseClient, bracketId: string, token: string): Promise<void> {
  const { error } = await client
    .from(`${DB_PREFIX}brackets`)
    .update({
      [`${DB_PREFIX}settlement_lock_token`]: null,
      [`${DB_PREFIX}settlement_lock_until`]: null,
    })
    .eq(`${DB_PREFIX}id`, bracketId)
    .eq(`${DB_PREFIX}settlement_lock_token`, token);
  if (error) console.error("[ARENA ADMIN] Failed to release settlement lock:", error.message);
}

export interface SettlementResult {
  changed: boolean;
  message: string;
  status?: Bracket["status"];
  round?: number;
}

export async function settleArenaIfDue(): Promise<SettlementResult> {
  const client = getAdminClient();
  const bracket = await fetchOpenBracket(client);
  if (!bracket) return { changed: false, message: "No active bracket found." };

  if (bracket.status === "preparing") {
    const remaining = getMillisecondsToNextNYMidnight(bracket.roundStartedAt);
    if (remaining > 0) return { changed: false, message: "Bracket is still preparing.", status: bracket.status };
  } else {
    const round = getActiveRound(bracket);
    const remaining = getRoundRemainingMs(round, bracket.roundStartedAt || new Date().toISOString());
    if (remaining > 0) {
      return { changed: false, message: "Round is still active.", status: bracket.status, round };
    }
  }

  const lockToken = randomUUID();
  if (!await acquireSettlementLock(client, bracket, lockToken)) {
    return { changed: false, message: "Settlement is already being processed." };
  }

  try {
    // Reload after acquiring the lock so a vote that committed immediately before
    // the lock is included in the authoritative settlement snapshot.
    const lockedBracket = await fetchOpenBracket(client);
    if (!lockedBracket || lockedBracket.id !== bracket.id) {
      return { changed: false, message: "Bracket changed before settlement." };
    }

    if (lockedBracket.status === "preparing") {
      const activeBracket: Bracket = {
        ...lockedBracket,
        status: "active",
        roundStartedAt: new Date().toISOString(),
      };
      await saveBracket(client, activeBracket);
      return { changed: true, message: "Tournament started.", status: activeBracket.status, round: 1 };
    }

    const advanced = advanceTournamentRound(lockedBracket);
    await saveBracket(client, advanced);
    if (advanced.status === "completed") {
      await tryStartBracket(client);
    }
    return {
      changed: true,
      message: advanced.status === "completed" ? "Tournament completed." : "Round advanced.",
      status: advanced.status,
      round: getActiveRound(advanced),
    };
  } finally {
    await releaseSettlementLock(client, bracket.id, lockToken);
  }
}

export async function resetArenaToRoundThree(): Promise<string[]> {
  const client = getAdminClient();
  const bracket = await fetchOpenBracket(client);
  if (!bracket) throw new HttpError(404, "No active bracket found.");
  if (bracket.round2.length !== 4 || bracket.round2.some((match) => !match.winnerId)) {
    throw new HttpError(409, "Round 2 is not fully settled.");
  }

  const winners = bracket.round2.map((match) => match.winnerId === match.productA.id ? match.productA : match.productB);
  const round3: Match[] = [0, 1].map((index) => ({
    id: `${bracket.id}_r3_m${index + 1}`,
    roundNumber: 3,
    productA: winners[index * 2],
    productB: winners[index * 2 + 1],
    votesA: 0,
    votesB: 0,
    votedUserIds: [],
  }));

  await saveBracket(client, {
    ...bracket,
    status: "active",
    winner: undefined,
    roundStartedAt: new Date().toISOString(),
    round3,
    round4: [],
  }, 3);
  return round3.map((match) => `${match.productA.title} vs ${match.productB.title}`);
}
