import type { Product } from "./mockData";

export const DUPLICATE_PRODUCT_MESSAGE = "This website has already been submitted to Indie Clash.";

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

export function productLinkRel(product: Product): string {
  // Published product websites are followed immediately, including unreviewed
  // submissions. Keep moderation metadata independent from this launch policy.
  return product.moderationStatus === "restricted"
    ? "ugc nofollow noopener noreferrer" : "noopener noreferrer";
}
