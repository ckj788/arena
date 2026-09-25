import type { Product } from "./mockData";

// Profile details, not a quality score or a discovery-ranking input.
export function productReadiness(product: Partial<Product>) {
  return [
    { label: "Description", complete: (product.description?.trim().length || 0) >= 80 },
    { label: "Product screenshot", complete: Boolean(product.screenshots?.length || product.screenshot) },
    { label: "Custom logo", complete: Boolean(product.logo && product.logo !== "🚀") },
    { label: "Maker name", complete: Boolean(product.makerName?.trim() && !/^anonymous(?: maker)?$/i.test(product.makerName.trim())) },
    { label: "Target audience", complete: Boolean(product.targetAudience?.trim()) },
    { label: "Pricing", complete: Boolean(product.pricingModel && product.pricingModel !== "unspecified") },
    { label: "Maker story", complete: Boolean(product.makerStory?.trim()) },
    { label: "Feedback request", complete: Boolean(product.feedbackRequest?.trim()) },
  ];
}
