import "server-only";
import { createHash } from "node:crypto";
import type { Product } from "@/lib/mockData";
import { trustedProductImageUrl } from "@/lib/site";

export function legacyRasterImage(value: string | undefined) {
  if (!value?.startsWith("data:image/") || !trustedProductImageUrl(value)) return null;
  const separator = value.indexOf(",");
  return {
    contentType: value.slice(5, value.indexOf(";")),
    bytes: Buffer.from(value.slice(separator + 1), "base64"),
    version: createHash("sha256").update(value).digest("hex").slice(0, 16),
  };
}

// Existing database images stay intact. Only their public page representation
// changes, so the same bytes are downloaded once instead of serialized into
// HTML, RSC, related-product lists and every nested bracket copy.
export function withPublicImageUrls(product: Product): Product {
  const imageUrl = (value: string | undefined, asset: string) => {
    const image = legacyRasterImage(value);
    return image
      ? `/product-images/${encodeURIComponent(product.id)}?asset=${asset}&v=${image.version}`
      : value;
  };
  return {
    ...product,
    logo: imageUrl(product.logo, "logo")!,
    screenshot: imageUrl(product.screenshot, "screenshot"),
    screenshots: product.screenshots?.map((value, index) => imageUrl(value, `gallery-${index}`)!),
  };
}
