import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getPublicProducts } from "@/lib/server/publicSeoData";

// This check must stay outside loading.tsx's Suspense boundary. Otherwise a
// missing product streams a 200 before page.tsx can call notFound(). The directory
// has its own route group so its loading boundary cannot wrap this layout.
export default async function ProductLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(slug)) notFound();
  const products = await getPublicProducts();
  if (!products.some((product) => product.id.toLowerCase() === slug.toLowerCase())) notFound();
  return children;
}
