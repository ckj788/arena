import { permanentRedirect } from "next/navigation";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LegacyReviewPage({ params }: Props) {
  const { slug } = await params;
  permanentRedirect(`/products/${encodeURIComponent(slug)}`);
}
