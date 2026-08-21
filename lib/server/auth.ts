import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[SERVER CONFIG] Missing required environment variable: ${name}`);
    throw new HttpError(503, "Service configuration is incomplete.");
  }
  return value;
}

function getBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new HttpError(401, "Authentication required.");
  }
  return match[1];
}

export interface AuthenticatedRequest {
  user: User;
  accessToken: string;
  client: SupabaseClient;
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedRequest> {
  const supabaseUrl = requireEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnvironmentValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const accessToken = getBearerToken(request);

  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new HttpError(401, "Invalid or expired session.");
  }

  const providers = new Set([
    String(data.user.app_metadata?.provider || ""),
    ...(data.user.identities || []).map((identity) => identity.provider),
  ]);
  if (!providers.has("google") && !providers.has("github")) {
    throw new HttpError(403, "A verified Google or GitHub identity is required.");
  }

  return { user: data.user, accessToken, client };
}

export function getAdminClient(): SupabaseClient {
  const supabaseUrl = requireEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function secretsMatch(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function requireCronSecret(request: Request): void {
  const expected = requireEnvironmentValue("CRON_SECRET");
  const authorization = request.headers.get("authorization") || "";
  const provided = authorization.replace(/^Bearer\s+/i, "");
  if (!secretsMatch(provided, expected)) {
    throw new HttpError(401, "Unauthorized.");
  }
}

export async function requireAdmin(request: Request): Promise<User | null> {
  const configuredSecret = process.env.ADMIN_API_SECRET?.trim();
  const suppliedSecret = request.headers.get("x-admin-secret");
  if (configuredSecret && secretsMatch(suppliedSecret, configuredSecret)) {
    return null;
  }

  const { user } = await authenticateRequest(request);
  const adminEmails = new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!user.email || !adminEmails.has(user.email.toLowerCase())) {
    throw new HttpError(403, "Admin access required.");
  }
  return user;
}

export function jsonError(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error("[ARENA API] Unexpected error:", error);
  return Response.json({ error: "Internal Server Error" }, { status: 500 });
}

export function assertJsonRequest(request: Request, maxBytes = 256_000): void {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new HttpError(415, "Content-Type must be application/json.");
  }

  const rawLength = request.headers.get("content-length");
  if (rawLength && Number(rawLength) > maxBytes) {
    throw new HttpError(413, "Request body is too large.");
  }
}

export async function readJsonRequest(request: Request, maxBytes = 256_000): Promise<unknown> {
  assertJsonRequest(request, maxBytes);
  if (!request.body) throw new HttpError(400, "Request body is required.");

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "Request body is too large.");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Request body must contain valid JSON.");
  }
}
