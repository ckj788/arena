import { getCataloguePage } from "@/lib/server/cataloguePages";

export async function GET(request: Request) {
  const after = new URL(request.url).searchParams.get("after") ?? "";
  if (after.length > 200) return new Response(null, { status: 400 });
  try {
    const page = await getCataloguePage(after);
    const headers = { ETag: page.etag, "Cache-Control": "public, max-age=0, must-revalidate" };
    if (page.etag && request.headers.get("if-none-match") === page.etag) {
      return new Response(null, { status: 304, headers });
    }
    return Response.json(page, { headers });
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
