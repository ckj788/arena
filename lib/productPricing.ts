import { publicHttpUrl } from "./site";
import type { PricingModel } from "./productTaxonomy";

export const PRICE_CURRENCIES = ["USD", "EUR", "GBP", "CNY", "JPY", "CAD", "AUD", "INR", "BRL", "SGD", "HKD", "KRW", "CHF", "SEK", "PLN", "NZD", "MXN", "AED"] as const;
export const BILLING_PERIODS = [
  { value: "one-time", label: "One-time payment", suffix: "one-time" },
  { value: "month", label: "Monthly", suffix: "per month" },
  { value: "year", label: "Yearly", suffix: "per year" },
  { value: "free", label: "Free plan (no charge)", suffix: "free plan" },
] as const;

export interface ProductPricing {
  planName: string;
  amount: string;
  currency: string;
  billingPeriod: (typeof BILLING_PERIODS)[number]["value"];
  pricingUrl: string;
}

export interface PricingDraft {
  planName: string;
  amount: string;
  currency: string;
  billingPeriod: string;
  pricingUrl: string;
}

export const EMPTY_PRICING_DRAFT: PricingDraft = { planName: "", amount: "", currency: "", billingPeriod: "", pricingUrl: "" };

// A quote is optional, but a provided quote must describe a real, complete plan.
// Both the form and the API use these same business rules.
export function productPricingError(value: unknown, model: PricingModel): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return "Pricing details must describe one plan.";
  const quote = value as Record<string, unknown>;
  for (const field of ["planName", "amount", "currency", "billingPeriod", "pricingUrl"]) {
    if (typeof quote[field] !== "string" || !(quote[field] as string).trim()) return "Complete all plan fields, or leave the optional pricing section empty.";
  }
  if (model === "unspecified" || model === "contact") return "Choose Free, Freemium, Paid, or Open source before adding an exact price.";
  const name = (quote.planName as string).trim();
  if (name.length < 2 || name.length > 80) return "Plan name must be between 2 and 80 characters.";
  const amount = (quote.amount as string).trim();
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/.test(amount)) return "Enter a non-negative price with up to 6 decimal places, without currency symbols or commas.";
  if (!(PRICE_CURRENCIES as readonly string[]).includes((quote.currency as string).trim().toUpperCase())) return "Choose a supported currency.";
  if (!BILLING_PERIODS.some(period => period.value === quote.billingPeriod)) return "Choose a billing period.";
  const zero = Number(amount) === 0;
  if (zero && (quote.billingPeriod !== "free" || model === "paid")) return "A zero price must describe an actual free plan, not a free trial or free submission.";
  if (!zero && (quote.billingPeriod === "free" || model === "free")) return "A free plan must have a price of 0. Choose the matching pricing model and billing period.";
  if ((quote.pricingUrl as string).length > 500 || !publicHttpUrl(quote.pricingUrl as string)) return "Enter a valid public http or https URL for the official pricing page.";
  return null;
}

export function normalizeProductPricing(draft: PricingDraft): ProductPricing {
  return {
    planName: draft.planName.trim(), amount: draft.amount.trim(), currency: draft.currency.trim().toUpperCase(),
    billingPeriod: draft.billingPeriod as ProductPricing["billingPeriod"], pricingUrl: publicHttpUrl(draft.pricingUrl)!,
  };
}

export function pricingDraftValue(draft: PricingDraft): PricingDraft | null {
  return Object.values(draft).some(value => value.trim()) ? draft : null;
}

export function productPriceLabel(quote: ProductPricing): string {
  const suffix = BILLING_PERIODS.find(period => period.value === quote.billingPeriod)!.suffix;
  return `${quote.currency} ${quote.amount} · ${suffix}`;
}

export function productOffer(quote: ProductPricing) {
  return {
    "@type": "Offer", name: quote.planName, url: quote.pricingUrl,
    price: quote.amount, priceCurrency: quote.currency,
    ...(quote.billingPeriod === "month" || quote.billingPeriod === "year" ? {
      priceSpecification: {
        "@type": "UnitPriceSpecification", price: quote.amount, priceCurrency: quote.currency,
        billingDuration: quote.billingPeriod === "month" ? "P1M" : "P1Y",
      },
    } : {}),
  };
}
