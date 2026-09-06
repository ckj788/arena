export const PRODUCT_CATEGORIES = [
  { value: "ai-tools", label: "AI Tools", description: "Independent AI assistants, agents, generators, and applied machine-learning products." },
  { value: "developer-tools", label: "Developer Tools", description: "APIs, infrastructure, debugging, automation, and software-building tools for developers." },
  { value: "productivity", label: "Productivity", description: "Indie tools for focus, organization, collaboration, note-taking, and getting work done." },
  { value: "marketing", label: "Marketing", description: "Products for distribution, SEO, social publishing, conversion, outreach, and customer growth." },
  { value: "design-tools", label: "Design Tools", description: "Independent products for UI, graphics, creative workflows, prototyping, and visual production." },
  { value: "video-tools", label: "Video Tools", description: "Tools for video creation, editing, repurposing, generation, and production workflows." },
  { value: "founder-tools", label: "Founder Tools", description: "Practical tools for validating, launching, operating, and growing an independent business." },
  { value: "saas", label: "SaaS", description: "New software-as-a-service products built and shipped by independent makers." },
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]["value"];

export const PRICING_MODELS = [
  { value: "unspecified", label: "Not specified" },
  { value: "free", label: "Free" },
  { value: "freemium", label: "Freemium" },
  { value: "paid", label: "Paid" },
  { value: "open-source", label: "Open source" },
  { value: "contact", label: "Contact for pricing" },
] as const;

export type PricingModel = (typeof PRICING_MODELS)[number]["value"];

export function categoryLabel(value?: string): string | null {
  return PRODUCT_CATEGORIES.find((category) => category.value === value)?.label ?? null;
}

export function pricingLabel(value?: string): string | null {
  if (!value || value === "unspecified") return null;
  return PRICING_MODELS.find((pricing) => pricing.value === value)?.label ?? null;
}
