export const SITE_NAME = "Indie Clash";
export const SITE_URL = "https://www.indieclash.com";
export const SITE_DESCRIPTION =
  "Discover new and underrated indie products, explore permanent maker profiles, and compare critique-driven Arena matchups without paid rankings.";
export const PRODUCT_LOGO_BUCKET = "product-logos";
const LEGACY_PRODUCT_IMAGE_LIMIT = 100_000;
const LEGACY_PRODUCT_IMAGE_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i;

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function isPublicImageUrl(value: string | undefined) {
  return Boolean(value && (value.startsWith("https://") || value.startsWith("/")));
}

export function trustedProductImageUrl(value: string | undefined) {
  if (!value) return undefined;
  if (value.startsWith("/")) return value;

  // Products submitted before the Storage upload route was introduced keep a
  // small raster logo as a data URI in the database. These are public product
  // assets, not authentication data. Accept only tightly validated raster
  // formats and cap their encoded size; SVG/HTML and arbitrary data URIs stay
  // blocked. New submissions continue to use the public Storage bucket.
  if (
    value.length <= LEGACY_PRODUCT_IMAGE_LIMIT
    && LEGACY_PRODUCT_IMAGE_PATTERN.test(value)
  ) {
    return value;
  }

  try {
    const imageUrl = new URL(value);
    const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://invalid.local");
    const expectedPrefix = `/storage/v1/object/public/${PRODUCT_LOGO_BUCKET}/`;
    if (
      imageUrl.protocol === "https:" &&
      imageUrl.hostname === supabaseUrl.hostname &&
      imageUrl.pathname.startsWith(expectedPrefix)
    ) {
      return imageUrl.toString();
    }
  } catch {
    // Untrusted or malformed remote images are rendered as a safe fallback.
  }

  return undefined;
}

export function publicHttpUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    // Older submissions sometimes prepended https:// to an already complete
    // address (for example https://HTTPS://mistol.ai). Strip only redundant
    // leading HTTP(S) schemes; never guess a domain or rewrite path/query data.
    const trimmed = value.trim().replace(/^(?:https?:\/\/\s*)+(?=https?:\/\/)/i, "");
    if (/\s|\\/.test(trimmed)) return undefined;
    const url = new URL(trimmed);
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.hostname &&
      url.hostname.includes(".") &&
      !url.username && !url.password &&
      !url.hostname.includes("%20") &&
      !url.hostname.includes(" ")
    ) {
      return url.toString();
    }
  } catch {
    // Legacy submissions may contain malformed URLs; omit them from links/schema.
  }
  return undefined;
}
