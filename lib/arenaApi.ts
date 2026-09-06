import type { Product } from "./mockData";
import { supabase } from "./supabaseClient";

interface ApiErrorPayload {
  error?: string;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 20_000,
  networkErrorMessage = "Unable to reach the Indie Clash service. Please try again.",
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("The request timed out. Please check your connection and try again.");
    }
    if (error instanceof TypeError) {
      throw new Error(networkErrorMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function authenticatedJson<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  if (!supabase) {
    throw new Error("Cloud mode is not configured.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Your session has expired. Please link your identity again.");
  }

  const response = await fetchWithTimeout(
    path,
    {
      method,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: method === "GET" ? undefined : (body === undefined ? "{}" : JSON.stringify(body)),
    },
    20_000,
    "Unable to reach the product submission service. Please try again.",
  );

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
  description: string;
  category?: Product["category"];
  pricingModel: NonNullable<Product["pricingModel"]>;
  platforms: string[];
  targetAudience: string;
  makerStory: string;
  feedbackRequest: string;
}

function imageDataUrlToBlob(value: string): Blob {
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match?.[1] || !match[2]) {
    throw new Error("Logo must be a PNG, JPEG, or WebP image.");
  }

  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    throw new Error("The selected logo could not be decoded. Please choose the image again.");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: match[1].toLowerCase() });
}

export async function uploadArenaLogo(logo: string): Promise<string> {
  if (!logo.startsWith("data:image")) return logo;
  if (!supabase) throw new Error("Cloud mode is not configured.");

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Your session has expired. Please sign in again.");

  // Decode locally instead of fetching the data: URL. A strict connect-src CSP
  // correctly blocks data: network requests even though img-src permits preview.
  const blob = imageDataUrlToBlob(logo);
  if (blob.size > 1_000_000) throw new Error("Logo must be smaller than 1 MB after resizing.");

  const uploadResponse = await fetchWithTimeout(
    "/api/arena/logo",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": blob.type,
      },
      body: blob,
    },
    20_000,
    "Unable to reach the logo upload service. Please try again.",
  );
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

export async function updateArenaProduct(productId: string, input: ProductSubmission): Promise<Product> {
  const result = await authenticatedJson<{ product: Product }>(
    `/api/arena/products/${encodeURIComponent(productId)}`,
    input,
    "PATCH",
  );
  return result.product;
}

export async function fetchOwnedArenaProductIds(): Promise<string[]> {
  const result = await authenticatedJson<{ productIds: string[] }>("/api/arena/products/mine", undefined, "GET");
  return Array.isArray(result.productIds) ? result.productIds.filter((id) => typeof id === "string") : [];
}

export async function fetchOwnedArenaProducts(): Promise<{ productIds: string[]; products: Product[] }> {
  const result = await authenticatedJson<{ productIds?: string[]; products?: Product[] }>("/api/arena/products/mine", undefined, "GET");
  if (!Array.isArray(result.productIds)) throw new Error("Unable to load your products. Please retry.");
  return { productIds: result.productIds.filter((id) => typeof id === "string"), products: Array.isArray(result.products) ? result.products : [] };
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

export async function recordQualifiedExposure(productId: string): Promise<void> {
  const response = await fetchWithTimeout(
    "/api/arena/exposure",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: [productId] }),
      keepalive: true,
    },
    10_000,
    "",
  );
  if (!response.ok) throw new Error("Unable to record exposure.");
}
