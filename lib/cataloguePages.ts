import type { Product } from "./mockData";

export interface CataloguePage {
  products: Product[];
  next: string | null;
  etag: string;
}

export function catalogueProducts(pages: CataloguePage[]) {
  return pages.flatMap(page => page.products).sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
}

export async function refreshCatalogue(previous: CataloguePage[], signal: AbortSignal) {
  const pages: CataloguePage[] = [];
  let cursor = "";
  do {
    const cached: CataloguePage | undefined = pages.length === 0 || previous[pages.length - 1]?.next === cursor
      ? previous[pages.length] : undefined;
    const url = "/api/arena/catalogue" + (cursor ? "?after=" + encodeURIComponent(cursor) : "");
    const response = await fetch(url, {
      signal, cache: "no-store",
      headers: cached?.etag ? { "If-None-Match": cached.etag } : {},
    });
    let page: CataloguePage;
    if (response.status === 304 && cached) page = cached;
    else {
      if (!response.ok) throw new Error("Unable to refresh products.");
      page = await response.json();
    }
    pages.push(page);
    cursor = page.next ?? "";
  } while (cursor);
  return pages.length === previous.length && pages.every((page, i) => page === previous[i]) ? previous : pages;
}
