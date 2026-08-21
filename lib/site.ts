export const SITE_NAME = "Indie Clash";
export const SITE_URL = "https://www.indieclash.com";
export const SITE_DESCRIPTION =
  "Discover newly launched indie products, compare real arena matchups, and read constructive feedback from verified builders.";

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function isPublicImageUrl(value: string | undefined) {
  return Boolean(value && (value.startsWith("https://") || value.startsWith("/")));
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
