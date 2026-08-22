export const SITE_NAME = "Indie Clash";
export const SITE_URL = "https://www.indieclash.com";
export const SITE_DESCRIPTION =
  "Discover newly launched indie products, compare real arena matchups, and read constructive feedback from authenticated community members.";
export const PRODUCT_LOGO_BUCKET = "product-logos";

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
    const url = new URL(value);
    if ((url.protocol === "https:" || url.protocol === "http:") && url.hostname) {
      return url.toString();
    }
  } catch {
    // Legacy submissions may contain malformed URLs; omit them from links/schema.
  }
  return undefined;
}
