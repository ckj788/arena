import { NextResponse } from "next/server";
import { createProductForUser, type NewProductInput } from "@/lib/server/arenaAdmin";
import { authenticateRequest, HttpError, jsonError, readJsonRequest } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

function requiredText(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") throw new HttpError(400, `${field} is required.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new HttpError(400, `${field} must be between ${min} and ${max} characters.`);
  }
  return normalized;
}

function safeHttpUrl(value: unknown, field: string): string {
  const raw = requiredText(value, field, 4, 500);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, `${field} must be a valid URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new HttpError(400, `${field} must use http or https.`);
  }
  return url.toString();
}

function safeLogo(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "🚀";
  const logo = value.trim();
  if (logo.length > 220_000) throw new HttpError(400, "Logo is too large.");
  if (/^https?:\/\//i.test(logo)) return safeHttpUrl(logo, "Logo");
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(logo)) return logo;
  if ([...logo].length <= 8 && !/[<>]/.test(logo)) return logo;
  throw new HttpError(400, "Logo must be an emoji, an image URL, or a supported base64 image.");
}

function parseProductInput(body: unknown): NewProductInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Invalid request body.");
  }
  const value = body as Record<string, unknown>;
  const shipTimeframe = value.shipTimeframe;
  if (shipTimeframe !== "24h" && shipTimeframe !== "48h" && shipTimeframe !== "7d") {
    throw new HttpError(400, "Invalid ship timeframe.");
  }

  const makerTwitter = requiredText(value.makerTwitter, "Maker handle", 1, 50);
  const makerAvatar = typeof value.makerAvatar === "string" && value.makerAvatar.trim()
    ? safeHttpUrl(value.makerAvatar, "Maker avatar")
    : "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=faces";

  return {
    title: requiredText(value.title, "Title", 2, 80),
    tagline: requiredText(value.tagline, "Tagline", 10, 240),
    url: safeHttpUrl(value.url, "Product URL"),
    shipTimeframe,
    makerName: requiredText(value.makerName, "Maker name", 1, 80),
    makerTwitter: makerTwitter.startsWith("@") ? makerTwitter : `@${makerTwitter}`,
    makerAvatar,
    logo: safeLogo(value.logo),
  };
}

export async function POST(request: Request) {
  try {
    const { user } = await authenticateRequest(request);
    const product = await createProductForUser(user, parseProductInput(await readJsonRequest(request)));
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
