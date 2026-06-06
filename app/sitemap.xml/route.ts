import { supabase, DB_PREFIX } from "@/lib/supabaseClient";
import { SEED_PRODUCTS } from "@/lib/mockData";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = "https://www.indieclash.com";
  
  const urls: string[] = [
    `<url><loc>${baseUrl}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
  ];

  if (supabase) {
    try {
      // 1. Fetch all submitted products for reviews
      const { data: products } = await supabase
        .from(`${DB_PREFIX}products`)
        .select(`${DB_PREFIX}id, ${DB_PREFIX}submitted_at`);

      if (products) {
        products.forEach((p: any) => {
          const id = p[`${DB_PREFIX}id`];
          const date = p[`${DB_PREFIX}submitted_at`]
            ? new Date(p[`${DB_PREFIX}submitted_at`]).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0];

          urls.push(`
            <url>
               <loc>${baseUrl}/reviews/${id}</loc>
               <lastmod>${date}</lastmod>
               <changefreq>weekly</changefreq>
               <priority>0.8</priority>
            </url>
          `);
        });
      }

      // 2. Fetch all matches for versus duels
      const { data: matches } = await supabase
        .from(`${DB_PREFIX}matches`)
        .select(`${DB_PREFIX}product_a_id, ${DB_PREFIX}product_b_id`);

      if (matches) {
        matches.forEach((m: any) => {
          const slug = `${m[`${DB_PREFIX}product_a_id`]}-vs-${m[`${DB_PREFIX}product_b_id`]}`;
          urls.push(`
            <url>
               <loc>${baseUrl}/versus/${slug}</loc>
               <changefreq>daily</changefreq>
               <priority>0.8</priority>
            </url>
          `);
        });
      }
    } catch (e) {
      console.error("Sitemap generation error, falling back to mock sitemap:", e);
    }
  }

  // Local sandbox backup generator (e.g. offline dev builds)
  if (urls.length <= 1) {
    SEED_PRODUCTS.forEach(p => {
      urls.push(`
        <url>
          <loc>${baseUrl}/reviews/${p.id.toLowerCase()}</loc>
          <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
          <changefreq>weekly</changefreq>
          <priority>0.8</priority>
        </url>
      `);
    });

    // Generate pairing samples
    for (let i = 0; i < SEED_PRODUCTS.length - 1; i += 2) {
      const slug = `${SEED_PRODUCTS[i].id.toLowerCase()}-vs-${SEED_PRODUCTS[i+1].id.toLowerCase()}`;
      urls.push(`
        <url>
          <loc>${baseUrl}/versus/${slug}</loc>
          <changefreq>daily</changefreq>
          <priority>0.8</priority>
        </url>
      `);
    }
  }

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${urls.map(u => u.trim()).join("\n")}
    </urlset>
  `;

  return new Response(sitemapXml.trim(), {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=600",
    },
  });
}
