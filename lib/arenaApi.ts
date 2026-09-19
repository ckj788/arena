import type { Product } from "./mockData";
import { supabase } from "./supabaseClient";
import { fetchJsonWithDeadline, withDeadline } from "./requestSafety";

interface ApiErrorPayload {
  error?: string;
}

export class AuthSessionExpiredError extends Error {
  constructor() {
    super("Your sign-in could not be verified. Please sign in again.");
    this.name = "AuthSessionExpiredError";
  }
}

let refreshInFlight: ReturnType<NonNullable<typeof supabase>["auth"]["refreshSession"]> | null = null;

async function expireLocalSession(): Promise<never> {
  // A rejected token must not leave the console claiming the maker is connected.
  if (typeof window !== "undefined") window.dispatchEvent(new Event("indieclash:auth-expired"));
  if (supabase) {
    try { await withDeadline(supabase.auth.signOut({ scope: "local" }), 10_000); } catch { /* Re-authentication can replace a stale local session. */ }
  }
  throw new AuthSessionExpiredError();
}

async function renewedAccessToken(rejectedToken: string): Promise<string> {
  if (!supabase) return expireLocalSession();
  const current = await withDeadline(supabase.auth.getSession(), 10_000);
  if (current.error) throw current.error;
  const currentToken = current.data.session?.access_token;
  if (currentToken && currentToken !== rejectedToken) return currentToken;
  if (!current.data.session) return expireLocalSession();
  if (!refreshInFlight) {
    refreshInFlight = supabase.auth.refreshSession(current.data.session);
    void refreshInFlight.finally(() => { refreshInFlight = null; }).catch(() => {});
  }
  const pendingRefresh = refreshInFlight;
  let refreshed: Awaited<typeof pendingRefresh>;
  try {
    refreshed = await withDeadline(pendingRefresh, 10_000);
  } catch (error) {
    if (refreshInFlight === pendingRefresh) refreshInFlight = null;
    throw error;
  }
  if (refreshed.error || !refreshed.data.session?.access_token) return expireLocalSession();
  return refreshed.data.session.access_token;
}

export async function authenticatedJson<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  if (!supabase) {
    throw new Error("Cloud mode is not configured.");
  }

  const { data, error } = await withDeadline(supabase.auth.getSession(), 10_000);
  if (error) throw error;
  if (!data.session?.access_token) return expireLocalSession();

  const request = (token: string) => fetchJsonWithDeadline<T & ApiErrorPayload>(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: method === "GET" ? undefined : (body === undefined ? "{}" : JSON.stringify(body)),
  }, 20_000);

  let { response, payload } = await request(data.session.access_token);
  if (response.status === 401) {
    // Authentication is checked before any route mutation, so this retry cannot
    // duplicate a successfully committed action. Never retry timeouts or 5xx.
    ({ response, payload } = await request(await renewedAccessToken(data.session.access_token)));
    if (response.status === 401) return expireLocalSession();
  }

  if (!payload || typeof payload !== "object") throw new Error("Invalid service response.");
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
  screenshot?: string;
  screenshots?: string[];
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
    throw new Error("Image must be a PNG, JPEG, or WebP file.");
  }

  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    throw new Error("The selected image could not be decoded. Please choose it again.");
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

  const { data, error } = await withDeadline(supabase.auth.getSession(), 10_000);
  if (error) throw error;
  if (!data.session?.access_token) return expireLocalSession();

  // Decode locally instead of fetching the data: URL. A strict connect-src CSP
  // correctly blocks data: network requests even though img-src permits preview.
  const blob = imageDataUrlToBlob(logo);
  if (blob.size > 1_000_000) throw new Error("Image must be smaller than 1 MB after resizing.");

  const upload = (token: string) => fetchJsonWithDeadline<{ url?: string; error?: string }>(
    "/api/arena/logo",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": blob.type,
      },
      body: blob,
    },
    20_000,
  );
  let { response: uploadResponse, payload } = await upload(data.session.access_token);
  if (uploadResponse.status === 401) {
    ({ response: uploadResponse, payload } = await upload(await renewedAccessToken(data.session.access_token)));
    if (uploadResponse.status === 401) return expireLocalSession();
  }
  if (!uploadResponse.ok || !payload?.url) {
    throw new Error(payload?.error || "Unable to upload the product image.");
  }
  return payload.url;
}

export async function submitArenaProduct(input: ProductSubmission): Promise<Product> {
  const result = await authenticatedJson<{ product: Product }>("/api/arena/products", input);
  if (!result.product?.id) throw new Error("Submission response was incomplete. Check your console before submitting again.");
  return result.product;
}

export async function updateArenaProduct(productId: string, input: ProductSubmission): Promise<Product> {
  const result = await authenticatedJson<{ product: Product }>(
    `/api/arena/products/${encodeURIComponent(productId)}`,
    input,
    "PATCH",
  );
  if (!result.product?.id) throw new Error("Save response was incomplete. Check your profile before saving again.");
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
  const result = await authenticatedJson<{ bracketStarted: boolean }>(`/api/arena/products/${encodeURIComponent(productId)}/queue`);
  if (typeof result.bracketStarted !== "boolean") throw new Error("Queue response was incomplete. Check your console before retrying.");
  return result;
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
  const result = await authenticatedJson<CastVoteResult>("/api/arena/vote", input);
  if (!Number.isFinite(result.votesA) || !Number.isFinite(result.votesB) || !result.voterId) {
    throw new Error("Vote response was incomplete. Check the match before voting again.");
  }
  return result;
}

export async function requestArenaSettlement(): Promise<void> {
  await authenticatedJson("/api/arena/settle");
}

export async function recordQualifiedExposure(productId: string): Promise<void> {
  const { response, payload } = await fetchJsonWithDeadline<{ recorded?: number; configured?: boolean }>(
    "/api/arena/exposure",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: [productId] }),
      keepalive: true,
    },
    10_000,
  );
  if (!response.ok || payload?.configured === false || typeof payload?.recorded !== "number") {
    throw new Error("Unable to record exposure.");
  }
}
