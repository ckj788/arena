import { supabase } from "@/lib/supabaseClient";
import { SEED_PRODUCTS } from "@/lib/mockData";

export async function GET() {
  const baseUrl = "https://arena-chi-coral.vercel.app";
  
  const urls: string[] = [
    `<url><loc>${baseUrl}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
  ];

  if (supabase) {
    try {
      // 1. Fetch all submitted products for reviews
      const { data: products } = await supabase
        .from("shipandbattle_products")
        .select("shipandbattle_id, shipandbattle_submitted_at");

      if (products) {
        products.forEach(p => {
          const id = p.shipandbattle_id;
          const date = p.shipandbattle_submitted_at
            ? new Date(p.shipandbattle_submitted_at).toISOString().split("T")[0]
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
        .from("shipandbattle_matches")
        .select("shipandbattle_product_a_id, shipandbattle_product_b_id");

      if (matches) {
        matches.forEach(m => {
          const slug = `${m.shipandbattle_product_a_id}-vs-${m.shipandbattle_product_b_id}`;
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
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
