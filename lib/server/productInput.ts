import "server-only";

import type { NewProductInput } from "@/lib/server/arenaAdmin";
import { HttpError } from "@/lib/server/auth";
import { publicHttpUrl, trustedProductImageUrl } from "@/lib/site";
import { PRICING_MODELS, PRODUCT_CATEGORIES } from "@/lib/productTaxonomy";

function requiredText(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") throw new HttpError(400, `${field} is required.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new HttpError(400, `${field} must be between ${min} and ${max} characters.`);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new HttpError(400, `${field} must be text.`);
  const normalized = value.trim();
  if (normalized.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer.`);
  return normalized;
}

function stringList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 8) throw new HttpError(400, `${field} must contain no more than 8 items.`);
  const items = value.map((item) => optionalText(item, field, 40)).filter(Boolean);
  return [...new Set(items.map((item) => item.toLowerCase()))];
}

function safeHttpUrl(value: unknown, field: string): string {
  const raw = requiredText(value, field, 4, 500);
  const url = publicHttpUrl(raw);
  if (!url) throw new HttpError(400, `${field} must be a valid public http or https URL without spaces or credentials.`);
  return url;
}

function safeLogo(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "🚀";
  const logo = value.trim();
  if (logo.length > 1_000) throw new HttpError(400, "Logo URL is too large.");
  if (/^https?:\/\//i.test(logo) && trustedProductImageUrl(logo)) return logo;
  if ([...logo].length <= 8 && !/[<>]/.test(logo)) return logo;
  throw new HttpError(400, "Logo must be an emoji or an uploaded Indie Clash image.");
}

function safeScreenshot(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > 1_000) throw new HttpError(400, "Screenshot URL is invalid.");
  const screenshot = trustedProductImageUrl(value.trim());
  if (!screenshot || !screenshot.startsWith("https://")) {
    throw new HttpError(400, "Screenshot must be an uploaded Indie Clash image.");
  }
  return screenshot;
}

export function parseProductInput(body: unknown): NewProductInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Invalid request body.");
  }
  const value = body as Record<string, unknown>;
  let screenshots: string[] | undefined;
  if (value.screenshots !== undefined) {
    if (!Array.isArray(value.screenshots) || value.screenshots.length > 5) throw new HttpError(400, "Upload no more than 5 product images.");
    screenshots = value.screenshots.map(item => {
      const image = safeScreenshot(item);
      if (!image) throw new HttpError(400, "Product image cannot be empty.");
      return image;
    });
  }
  const shipTimeframe = value.shipTimeframe;
  if (shipTimeframe !== "24h" && shipTimeframe !== "48h" && shipTimeframe !== "7d") {
    throw new HttpError(400, "Invalid ship timeframe.");
  }

  const makerTwitter = requiredText(value.makerTwitter, "Maker handle", 1, 50);
  const category = optionalText(value.category, "Category", 40);
  if (category && !PRODUCT_CATEGORIES.some((item) => item.value === category)) {
    throw new HttpError(400, "Invalid product category.");
  }
  const pricingModel = optionalText(value.pricingModel, "Pricing model", 40) || "unspecified";
  if (!PRICING_MODELS.some((item) => item.value === pricingModel)) {
    throw new HttpError(400, "Invalid pricing model.");
  }
  return {
    title: requiredText(value.title, "Title", 2, 80),
    tagline: requiredText(value.tagline, "Tagline", 10, 240),
    url: safeHttpUrl(value.url, "Product URL"),
    shipTimeframe,
    makerName: requiredText(value.makerName, "Maker name", 1, 80),
    makerTwitter: makerTwitter.startsWith("@") ? makerTwitter : `@${makerTwitter}`,
    logo: safeLogo(value.logo),
    screenshot: screenshots !== undefined ? screenshots[0] || "" : safeScreenshot(value.screenshot),
    screenshots,
    description: requiredText(value.description, "Description", 80, 2_000),
    category: category ? category as NewProductInput["category"] : undefined,
    pricingModel: pricingModel as NewProductInput["pricingModel"],
    platforms: stringList(value.platforms, "Platforms"),
    targetAudience: optionalText(value.targetAudience, "Target audience", 300),
    makerStory: optionalText(value.makerStory, "Maker story", 1_000),
    feedbackRequest: optionalText(value.feedbackRequest, "Feedback request", 500),
  };
}
