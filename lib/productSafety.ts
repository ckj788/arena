import type { Product } from "./mockData";

export const DUPLICATE_PRODUCT_MESSAGE = "This website has already been submitted to Indie Clash.";
export const DAILY_PUBLICATION_LIMIT_MESSAGE = "You can publish one free product per account per day.";

/** Host identity, not a substring match: hosted subdomains remain independent. */
export function productDomainKey(value: string): string {
  try {
    const url = new URL(value.trim().replace(/^(?:https?:\/\/\s*)+(?=https?:\/\/)/i, ""));
    const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    // Separate open-source projects on a shared hosting domain.
    if (host === "github.com" || host === "gitlab.com") {
      return `${host}/${url.pathname.split("/").filter(Boolean).slice(0, 2).join("/").toLowerCase()}`;
    }
    return host;
  } catch { return ""; }
}

export function findProductWithSameDomain<T extends Pick<Product, "id" | "url">>(
  products: readonly T[],
  url: string,
  editingProduct?: Pick<Product, "id" | "url"> | null,
): T | undefined {
  const domain = productDomainKey(url);
  // Historical duplicates can still edit their existing profiles. Only new
  // submissions and changes to a different domain need a duplicate check.
  if (!domain || (editingProduct && productDomainKey(editingProduct.url) === domain)) return undefined;
  return products.find(product => product.id !== editingProduct?.id && productDomainKey(product.url) === domain);
}

export function isVisibleProduct(product: Product): boolean {
  return product.moderationStatus !== "restricted";
}

// Production's 150th product (cleancitation), ordered by submitted_at then id.
const LAST_FOLLOWED_SUBMISSION = Date.parse("2026-11-27T06:15:59.083Z");

export function productLinkRel(product: Pick<Product, "submittedAt" | "moderationStatus" | "paidWebsiteLink">, placement?: "profile-website"): string {
  const submitted = Date.parse(product.submittedAt);
  // Missing database timestamps are represented by the Unix epoch in fromDbProduct.
  const grandfathered = submitted > 0 && submitted <= LAST_FOLLOWED_SUBMISSION;
  const paidWebsite = placement === "profile-website" && product.paidWebsiteLink === true;
  return product.moderationStatus !== "restricted" && (grandfathered || paidWebsite)
    ? "noopener noreferrer"
    : "ugc nofollow noopener noreferrer";
}
