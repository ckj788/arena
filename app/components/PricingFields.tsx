"use client";

import { useState } from "react";
import { BILLING_PERIODS, EMPTY_PRICING_DRAFT, PRICE_CURRENCIES, pricingDraftValue, type PricingDraft } from "@/lib/productPricing";

export default function PricingFields({ value, onChange, disabled }: {
  value: PricingDraft; onChange: (value: PricingDraft) => void; disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(Boolean(pricingDraftValue(value)));
  const fieldClass = "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100";
  const labelClass = "mb-1.5 block text-[10px] font-medium text-zinc-600";
  const update = (field: keyof PricingDraft, next: string) => onChange({ ...value, [field]: next });
  return (
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="rounded-xl border border-zinc-200 bg-zinc-50/60">
      <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-zinc-800">Add a plan &amp; price <span className="font-normal text-zinc-500">(optional)</span></summary>
      <fieldset disabled={disabled} className="space-y-4 border-t border-zinc-200/70 p-4 disabled:opacity-60">
        <p id="product-price-hint" className="text-[11px] leading-5 text-zinc-500">Skip this for now, or add one real plan from your official pricing page. You can update it later in your console.</p>
        <div>
          <label htmlFor="product-plan-name" className={labelClass}>Plan name</label>
          <input id="product-plan-name" value={value.planName} onChange={e => update("planName", e.target.value)} maxLength={80} placeholder="e.g. Starter, Pro, or Free plan" className={fieldClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="product-price-amount" className={labelClass}>Plan price</label>
            <input id="product-price-amount" type="text" inputMode="decimal" maxLength={16} value={value.amount} onChange={e => update("amount", e.target.value)} placeholder="e.g. 19.99" aria-describedby="product-price-hint product-free-price-hint" className={fieldClass} />
          </div>
          <div>
            <label htmlFor="product-price-currency" className={labelClass}>Currency</label>
            <select id="product-price-currency" value={value.currency} onChange={e => update("currency", e.target.value)} className={fieldClass}>
              <option value="">Choose currency</option>
              {PRICE_CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="product-price-period" className={labelClass}>Billing period</label>
          <select id="product-price-period" value={value.billingPeriod} onChange={e => update("billingPeriod", e.target.value)} className={fieldClass}>
            <option value="">Choose billing period</option>
            {BILLING_PERIODS.map(period => <option key={period.value} value={period.value}>{period.label}</option>)}
          </select>
          <p id="product-free-price-hint" className="mt-2 text-[10px] leading-4 text-zinc-500">Enter 0 only for an actual free plan. A trial, open-source license, or free launch does not automatically mean the product is free.</p>
        </div>
        <div>
          <label htmlFor="product-pricing-url" className={labelClass}>Official pricing page</label>
          <input id="product-pricing-url" type="url" inputMode="url" autoCapitalize="none" maxLength={500} value={value.pricingUrl} onChange={e => update("pricingUrl", e.target.value)} placeholder="https://your-product.com/pricing" className={fieldClass} />
        </div>
        <button type="button" onClick={() => onChange({ ...EMPTY_PRICING_DRAFT })} className="text-[11px] font-medium text-zinc-500 underline underline-offset-4 hover:text-zinc-900">Clear plan details</button>
      </fieldset>
    </details>
  );
}
