import type { Product } from "@/lib/mockData";
import { productReadiness } from "@/lib/productReadiness";

export default function ProfileReadiness({ product }: { product: Partial<Product> }) {
  const checks = productReadiness(product);
  const completed = checks.filter(check => check.complete).length;
  return <details className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 text-left">
    <summary className="cursor-pointer text-xs font-medium text-zinc-700">Profile details · {completed}/{checks.length} added</summary>
    <p className="mt-3 text-xs leading-5 text-zinc-500">Help visitors understand your product. Optional details do not affect your discovery position.</p>
    <ul className="mt-3 grid grid-cols-2 gap-2 text-xs">
      {checks.map(check => <li key={check.label} className={check.complete ? "text-emerald-700" : "text-zinc-500"}><span aria-hidden="true">{check.complete ? "✓" : "+"} </span>{check.label}<span className="sr-only">{check.complete ? " added" : " missing"}</span></li>)}
    </ul>
  </details>;
}
