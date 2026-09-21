import type { Product } from "./mockData";

/** Host identity, not a substring match: hosted subdomains remain independent. */
export function productDomainKey(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    // Separate open-source projects on a shared hosting domain.
    if (host === "github.com" || host === "gitlab.com") {
      return `${host}/${url.pathname.split("/").filter(Boolean).slice(0, 2).join("/").toLowerCase()}`;
    }
    return host;
  } catch { return ""; }
}

export function isVisibleProduct(product: Product): boolean {
  return product.moderationStatus !== "restricted";
}

export function productLinkRel(product: Product): string {
  // Published product websites are followed immediately, including unreviewed
  // submissions. Keep moderation metadata independent from this launch policy.
  return product.moderationStatus === "restricted"
    ? "ugc nofollow noopener noreferrer" : "noopener noreferrer";
}
