import { ImageResponse } from "next/og";
import { supabase } from "@/lib/supabaseClient";
import { SEED_PRODUCTS } from "@/lib/mockData";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    if (!slug) return new Response("Missing slug parameter", { status: 400 });

    const parts = slug.split("-vs-");
    const [slugA, slugB] = parts;

    let productA: any = null;
    let productB: any = null;

    if (supabase && slugA && slugB) {
      try {
        const { data: pA } = await supabase
          .from("shipandbattle_products")
          .select("*")
          .eq("shipandbattle_id", slugA)
          .single();

        const { data: pB } = await supabase
          .from("shipandbattle_products")
          .select("*")
          .eq("shipandbattle_id", slugB)
          .single();

        if (pA) {
          productA = {
            title: pA.shipandbattle_title,
            logo: pA.shipandbattle_logo,
            votesCount: pA.shipandbattle_votes_count,
          };
        }
        if (pB) {
          productB = {
            title: pB.shipandbattle_title,
            logo: pB.shipandbattle_logo,
            votesCount: pB.shipandbattle_votes_count,
          };
        }
      } catch (e) {
        console.error("Supabase query error in OG route:", e);
      }
    }

    // Fallback mock definitions if DB returns empty
    if (!productA || !productB) {
      const seedA = SEED_PRODUCTS.find(p => p.id.toLowerCase() === slugA?.toLowerCase());
      const seedB = SEED_PRODUCTS.find(p => p.id.toLowerCase() === slugB?.toLowerCase());

      const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

      productA = productA || {
        title: seedA ? seedA.title : capitalize(slugA || "Product A"),
        logo: seedA ? seedA.logo : "🚀",
        votesCount: 42,
      };

      productB = productB || {
        title: seedB ? seedB.title : capitalize(slugB || "Product B"),
        logo: seedB ? seedB.logo : "⚔️",
        votesCount: 37,
      };
    }

    const renderOgLogo = (logoStr: string) => {
      if (!logoStr) return null;
      const isImg = logoStr.startsWith("data:image") || logoStr.startsWith("http") || logoStr.startsWith("/");
      if (isImg) {
        return (
          <img
            src={logoStr}
            alt="Logo"
            style={{
              width: "110px",
              height: "110px",
              borderRadius: "16px",
            }}
          />
        );
      }
      return <span style={{ fontSize: "80px" }}>{logoStr}</span>;
    };

    // Generate dynamic 1200x630 layout
    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#070503",
            backgroundImage: "radial-gradient(circle at top, #1e1309 0%, #070503 80%)",
            border: "16px solid #ffbe18",
            padding: "60px",
          }}
        >
          {/* Top Banner Tag */}
          <div
            style={{
              display: "flex",
              fontSize: "24px",
              color: "#ffbe18",
              fontWeight: "900",
              letterSpacing: "4px",
              textTransform: "uppercase",
              border: "1px solid rgba(255, 190, 24, 0.3)",
              backgroundColor: "rgba(255, 190, 24, 0.05)",
              padding: "8px 24px",
              borderRadius: "40px",
              marginBottom: "40px",
            }}
          >
            ⚔️ INDIE CLASH DUEL ⚔️
          </div>

          {/* Versus Split Matrix Container */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              gap: "40px",
            }}
          >
            {/* Product A */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "40%",
              }}
            >
              <div
                style={{
                  fontSize: "96px",
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "24px",
                  width: "140px",
                  height: "140px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
                  overflow: "hidden",
                }}
              >
                {renderOgLogo(productA.logo)}
              </div>
              <span
                style={{
                  fontSize: "44px",
                  color: "#ffffff",
                  fontWeight: "900",
                  marginTop: "16px",
                  textAlign: "center",
                }}
              >
                {productA.title}
              </span>
              <span
                style={{
                  fontSize: "20px",
                  color: "#faf5ef",
                  opacity: 0.5,
                  marginTop: "6px",
                  fontFamily: "monospace",
                }}
              >
                {productA.votesCount} votes
              </span>
            </div>

            {/* Split Sword Divider */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: "54px", color: "#ffbe18", fontWeight: "900", fontStyle: "italic" }}>
                VS
              </span>
            </div>

            {/* Product B */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "40%",
              }}
            >
              <div
                style={{
                  fontSize: "96px",
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "24px",
                  width: "140px",
                  height: "140px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
                  overflow: "hidden",
                }}
              >
                {renderOgLogo(productB.logo)}
              </div>
              <span
                style={{
                  fontSize: "44px",
                  color: "#ffffff",
                  fontWeight: "900",
                  marginTop: "16px",
                  textAlign: "center",
                }}
              >
                {productB.title}
              </span>
              <span
                style={{
                  fontSize: "20px",
                  color: "#faf5ef",
                  opacity: 0.5,
                  marginTop: "6px",
                  fontFamily: "monospace",
                }}
              >
                {productB.votesCount} votes
              </span>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (err: any) {
    console.error("OpenGraph image API rendering error:", err);
    return new Response(`Failed to generate image: ${err.message}`, { status: 500 });
  }
}
