import { DB_PREFIX, publicArenaTable, supabase } from "@/lib/supabaseClient";
import { legacyRasterImage } from "@/lib/server/productImages";

// This is an image response cached by the CDN, not an ISR page. Read only the
// anonymous public view; this endpoint never uses an admin credential.
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const params = new URL(request.url).searchParams;
  const asset = params.get("asset") || "";
  const version = params.get("v") || "";
  if (!supabase || !/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(id)
    || !/^(logo|screenshot|gallery-[0-4])$/.test(asset) || !/^[a-f0-9]{16}$/.test(version)) {
    return new Response(null, { status: 404 });
  }
  const { data, error } = await supabase.from(publicArenaTable("products"))
    .select(["id", "logo", "screenshot", "screenshots", "moderation_status"].map(field => `${DB_PREFIX}${field}`).join(","))
    .eq(`${DB_PREFIX}id`, id).abortSignal(AbortSignal.timeout(8_000)).maybeSingle();
  if (error) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  const row = data as unknown as Record<string, unknown> | null;
  if (!row || row[`${DB_PREFIX}moderation_status`] === "restricted") return new Response(null, { status: 404 });
  const value = asset.startsWith("gallery-")
    ? (row[`${DB_PREFIX}screenshots`] as string[] | null)?.[Number(asset.slice(8))]
    : row[`${DB_PREFIX}${asset}`];
  const image = legacyRasterImage(typeof value === "string" ? value : undefined);
  if (!image || image.version !== version) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "ETag": `"${image.version}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
