// Collect categories now; public category browsing is an explicit later launch.
export const PUBLIC_CATEGORIES_ENABLED = false;

const LEGACY_CATEGORIES = [
  { value: "ai-tools", label: "AI Tools", description: "Independent AI assistants, agents, generators, and applied machine-learning products." },
  { value: "developer-tools", label: "Developer Tools", description: "APIs, infrastructure, debugging, automation, and software-building tools for developers." },
  { value: "productivity", label: "Productivity", description: "Indie tools for focus, organization, collaboration, note-taking, and getting work done." },
  { value: "marketing", label: "Marketing", description: "Products for distribution, SEO, social publishing, conversion, outreach, and customer growth." },
  { value: "design-tools", label: "Design Tools", description: "Independent products for UI, graphics, creative workflows, prototyping, and visual production." },
  { value: "video-tools", label: "Video Tools", description: "Tools for video creation, editing, repurposing, generation, and production workflows." },
  { value: "founder-tools", label: "Founder Tools", description: "Practical tools for validating, launching, operating, and growing an independent business." },
  { value: "saas", label: "SaaS", description: "New software-as-a-service products built and shipped by independent makers." },
] as const;

// Stable IDs: existing broad categories remain valid when makers edit old profiles.
const CATEGORY_GROUPS = [
  { label: "Artificial Intelligence", items: [
    ["ai-agents", "AI Agents"], ["ai-chatbots", "AI Chatbots & Assistants"],
    ["ai-image-generators", "AI Image Generators"], ["ai-video-generators", "AI Video Generators"],
    ["ai-writing", "AI Writing Assistants"], ["voice-ai", "Voice AI"],
    ["llms", "LLMs & AI Infrastructure"], ["ai-meeting-assistants", "AI Meeting Assistants"],
  ] },
  { label: "Engineering & Development", items: [
    ["code-editors", "Code Editors & Coding Agents"], ["apis", "APIs & SDKs"],
    ["no-code", "No-Code & Low-Code"], ["databases", "Databases"],
    ["hosting", "Hosting & Cloud Infrastructure"], ["testing", "Testing & QA"],
    ["monitoring", "Monitoring & Observability"], ["authentication", "Authentication & Security"],
    ["open-source-tools", "Open-Source Tools"],
  ] },
  { label: "Productivity & Collaboration", items: [
    ["note-taking", "Notes & Knowledge Management"], ["project-management", "Project & Task Management"],
    ["calendar-scheduling", "Calendars & Scheduling"], ["workflow-automation", "Workflow Automation"],
    ["email-tools", "Email Tools"], ["file-management", "File Management & PDFs"],
    ["team-collaboration", "Team Collaboration"], ["focus-time-tracking", "Focus & Time Tracking"],
  ] },
  { label: "Marketing & Sales", items: [
    ["seo", "SEO & Search Visibility"], ["social-media", "Social Media Management"],
    ["email-marketing", "Email Marketing & Newsletters"], ["crm", "CRM & Sales"],
    ["lead-generation", "Lead Generation & Outreach"], ["analytics", "Analytics & Attribution"],
    ["customer-support", "Customer Support & Feedback"],
  ] },
  { label: "Design & Creative", items: [
    ["ui-design", "UI Design & Prototyping"], ["graphic-design", "Graphic Design"],
    ["website-builders", "Website Builders"], ["video-editing", "Video Editing & Repurposing"],
    ["screen-recording", "Screenshots & Screen Recording"], ["audio-music", "Audio & Music"],
    ["presentations", "Presentations"], ["3d-animation", "3D & Animation"],
  ] },
  { label: "Business & Finance", items: [
    ["ecommerce", "E-commerce"], ["payments", "Payments & Billing"],
    ["accounting", "Accounting & Bookkeeping"], ["personal-finance", "Personal Finance"],
    ["hiring", "Hiring & Recruiting"], ["legal", "Legal & Compliance"],
    ["launch-tools", "Launch & Validation Tools"],
  ] },
  { label: "Lifestyle & Community", items: [
    ["education", "Education & Learning"], ["health-fitness", "Health & Fitness"],
    ["travel", "Travel"], ["communities", "Communities & Social Networking"],
    ["gaming", "Gaming"], ["news-reading", "News & Reading"],
  ] },
] as const;

type DetailedCategory = (typeof CATEGORY_GROUPS)[number]["items"][number][0];
export type ProductCategory = (typeof LEGACY_CATEGORIES)[number]["value"] | DetailedCategory;
type Category = { value: ProductCategory; label: string; description: string };

export const PRODUCT_CATEGORY_GROUPS: { label: string; categories: Category[] }[] = [
  ...CATEGORY_GROUPS.map(group => ({
    label: group.label,
    categories: group.items.map(([value, label]) => ({
      value, label, description: `Discover independent products for ${label.toLowerCase()}.`,
    })),
  })),
  { label: "General / Other", categories: [...LEGACY_CATEGORIES] },
];
export const PRODUCT_CATEGORIES = PRODUCT_CATEGORY_GROUPS.flatMap(group => group.categories);

export const PRICING_MODELS = [
  { value: "unspecified", label: "Not specified" },
  { value: "free", label: "Free" },
  { value: "freemium", label: "Freemium" },
  { value: "paid", label: "Paid" },
  { value: "open-source", label: "Open source" },
  { value: "contact", label: "Contact for pricing" },
] as const;

export type PricingModel = (typeof PRICING_MODELS)[number]["value"];

export function isProductCategory(value: unknown): value is ProductCategory {
  return typeof value === "string" && PRODUCT_CATEGORIES.some((category) => category.value === value);
}

export function categoryLabel(value?: string): string | null {
  if (!PUBLIC_CATEGORIES_ENABLED) return null;
  return PRODUCT_CATEGORIES.find((category) => category.value === value)?.label ?? null;
}

export function pricingLabel(value?: string): string | null {
  if (!value || value === "unspecified") return null;
  return PRICING_MODELS.find((pricing) => pricing.value === value)?.label ?? null;
}
