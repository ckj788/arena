import type { Product } from "./mockData";
import { supabase } from "./supabaseClient";

interface ApiErrorPayload {
  error?: string;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 20_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("The request timed out. Please check your connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function authenticatedJson<T>(path: string, body?: unknown): Promise<T> {
  if (!supabase) {
    throw new Error("Cloud mode is not configured.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Your session has expired. Please link your identity again.");
  }

  const response = await fetchWithTimeout(path, {
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

export async function uploadArenaLogo(logo: string): Promise<string> {
  if (!logo.startsWith("data:image")) return logo;
  if (!supabase) throw new Error("Cloud mode is not configured.");

  const match = logo.match(/^data:image\/(png|jpeg|webp);base64,/i);
  if (!match) throw new Error("Logo must be a PNG, JPEG, or WebP image.");

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Your session has expired. Please sign in again.");

  const response = await fetch(logo);
  const blob = await response.blob();
  if (blob.size > 1_000_000) throw new Error("Logo must be smaller than 1 MB after resizing.");

  const uploadResponse = await fetchWithTimeout("/api/arena/logo", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": blob.type,
    },
    body: blob,
  });
  const payload = await uploadResponse.json().catch(() => ({})) as { url?: string; error?: string };
  if (!uploadResponse.ok || !payload.url) {
    throw new Error(payload.error || "Unable to upload the product logo.");
  }
  return payload.url;
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
