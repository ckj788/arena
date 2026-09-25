"use client";

import type { Product } from "@/lib/mockData";
import { absoluteUrl } from "@/lib/site";
import CopyLink from "./CopyLink";
import ShareProductButton from "./ShareProductButton";
import Link from "./NavigationLink";
import { RESOURCE_PATH } from "@/lib/launchResources";

export default function LaunchShareKit({ product }: { product: Pick<Product, "id" | "title" | "tagline"> }) {
  const url = absoluteUrl(`/products/${encodeURIComponent(product.id)}`);
  const text = `${product.title.slice(0, 80)} is now on Indie Clash!\n\n${product.tagline.slice(0, 100)}\n\nTry it and tell me what you think:\n${url}`;
  const badge = `[![Featured on Indie Clash](https://img.shields.io/badge/Featured_on-Indie_Clash-ffbe18?style=flat-square)](${url})`;
  return <div className="space-y-3 text-left">
    <div className="flex flex-wrap gap-2">
      <ShareProductButton url={url} />
      <a href={`https://x.com/intent/post?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Share on X ↗</a>
    </div>
    <details className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 text-xs text-zinc-600">
      <summary className="cursor-pointer font-medium">Copy launch text or badge</summary>
      <div className="mt-4 space-y-4">
        <div><p className="mb-2">Launch text</p><CopyLink value={text} label="Launch announcement text" /></div>
        <div><p className="mb-2">Optional badge for your website or README</p><CopyLink value={badge} label="Featured badge Markdown" /></div>
      </div>
    </details>
    <Link href={RESOURCE_PATH} className="inline-block text-sm font-medium text-violet-700 hover:underline">Plan your next launch: compare launch platforms →</Link>
  </div>;
}
