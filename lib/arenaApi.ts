import type { Product } from "./mockData";
import { supabase } from "./supabaseClient";

interface ApiErrorPayload {
  error?: string;
}

async function authenticatedJson<T>(path: string, body?: unknown): Promise<T> {
  if (!supabase) {
    throw new Error("Cloud mode is not configured.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Your session has expired. Please link your identity again.");
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? "{}" : JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}.`);
  }
  return payload;
}

export interface ProductSubmission {
  title: string;
  tagline: string;
  url: string;
  shipTimeframe: Product["shipTimeframe"];
  makerName: string;
  makerTwitter: string;
  makerAvatar: string;
  logo: string;
}

export async function submitArenaProduct(input: ProductSubmission): Promise<Product> {
  const result = await authenticatedJson<{ product: Product }>("/api/arena/products", input);
  return result.product;
}

export async function enqueueArenaProduct(productId: string): Promise<{ bracketStarted: boolean }> {
  return authenticatedJson(`/api/arena/products/${encodeURIComponent(productId)}/queue`);
}

export interface CastVoteResult {
  votesA: number;
  votesB: number;
  voterId: string;
}

export async function castArenaVote(input: {
  matchId: string;
  votedProductId: string;
  winnerFeedback: string;
  loserFeedback: string;
}): Promise<CastVoteResult> {
  return authenticatedJson<CastVoteResult>("/api/arena/vote", input);
}

export async function requestArenaSettlement(): Promise<void> {
  await authenticatedJson("/api/arena/settle");
}
