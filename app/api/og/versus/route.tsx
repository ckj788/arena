import { ImageResponse } from "next/og";
import { getProductSeoData, getVersusSeoData } from "@/lib/server/publicSeoData";
import { absoluteUrl, trustedProductImageUrl } from "@/lib/site";

export const runtime = "nodejs";

interface OgProduct {
  title: string;
  logo: string;
  votesCount: number;
  tagline: string;
  shipTimeframe: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    if (!slug) return new Response("Missing slug parameter", { status: 400 });

    const versusData = await getVersusSeoData(slug);
    const productData = versusData ? null : await getProductSeoData(slug);
    if (!versusData && !productData) return new Response("Product or matchup not found", { status: 404 });

    const sourceA = versusData?.productA ?? productData!.product;
    const sourceB = versusData?.productB;
    const isComparison = Boolean(versusData && sourceB);
    const productA: OgProduct = {
      title: sourceA.title,
      logo: sourceA.logo,
      votesCount: sourceA.votesCount,
      tagline: sourceA.tagline,
      shipTimeframe: sourceA.shipTimeframe,
    };
    const productB: OgProduct | null = sourceB ? {
      title: sourceB.title,
      logo: sourceB.logo,
      votesCount: sourceB.votesCount,
      tagline: sourceB.tagline,
      shipTimeframe: sourceB.shipTimeframe,
    } : null;
    const totalDuels = productData?.matchups.length ?? 0;
    const winRate = totalDuels > 0 ? Math.round(((productData?.wins ?? 0) / totalDuels) * 100) : 0;

    const renderOgLogo = (logoStr: string) => {
      if (!logoStr) return null;
      const trustedImage = trustedProductImageUrl(logoStr);
      if (trustedImage) {
        return (
          <img
            src={trustedImage.startsWith("/") ? absoluteUrl(trustedImage) : trustedImage}
            alt=""
            style={{
              width: "110px",
              height: "110px",
              borderRadius: "16px",
            }}
          />
        );
      }
      const safeEmoji = [...logoStr].length <= 8 && !/[<>]/.test(logoStr) ? logoStr : "🚀";
      return <span style={{ fontSize: "80px" }}>{safeEmoji}</span>;
    };

    // Generate dynamic 1200x630 layout
    return new ImageResponse(
      isComparison ? (
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
                {renderOgLogo(productB!.logo)}
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
                {productB!.title}
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
                {productB!.votesCount} votes
              </span>
            </div>
          </div>
        </div>
      ) : (
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
            padding: "50px 60px",
          }}
        >
          {/* Top Banner Tag */}
          <div
            style={{
              display: "flex",
              fontSize: "22px",
              color: "#ffbe18",
              fontWeight: "900",
              letterSpacing: "4px",
              textTransform: "uppercase",
              border: "1px solid rgba(255, 190, 24, 0.3)",
              backgroundColor: "rgba(255, 190, 24, 0.05)",
              padding: "8px 24px",
              borderRadius: "40px",
              marginBottom: "35px",
            }}
          >
            🛡️ FOUNDER CRITIQUES & DUEL STATS 🛡️
          </div>

          {/* Main Info */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              gap: "40px",
              marginBottom: "35px",
            }}
          >
            {/* Logo */}
            <div
              style={{
                fontSize: "96px",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "24px",
                width: "150px",
                height: "150px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
                overflow: "hidden",
              }}
            >
              {renderOgLogo(productA.logo)}
            </div>

            {/* Title & Tagline */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                maxWidth: "600px",
              }}
            >
              <span
                style={{
                  fontSize: "52px",
                  color: "#ffffff",
                  fontWeight: "900",
                  lineHeight: "1.1",
                }}
              >
                {productA.title}
              </span>
              <span
                style={{
                  fontSize: "22px",
                  color: "#faf5ef",
                  opacity: 0.6,
                  marginTop: "12px",
                  fontWeight: "300",
                  lineHeight: "1.4",
                }}
              >
                {productA.tagline || "Innovative developer utility shipped in public sprint."}
              </span>
            </div>
          </div>

          {/* Stats Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              width: "80%",
              backgroundColor: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              padding: "16px 32px",
              borderRadius: "16px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: "14px", color: "#888", textTransform: "uppercase", letterSpacing: "1px" }}>Win Rate</span>
              <span style={{ fontSize: "28px", color: "#ffbe18", fontWeight: "bold", marginTop: "4px" }}>{winRate}%</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: "14px", color: "#888", textTransform: "uppercase", letterSpacing: "1px" }}>Total Duels</span>
              <span style={{ fontSize: "28px", color: "#fff", fontWeight: "bold", marginTop: "4px" }}>{totalDuels} duels</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: "14px", color: "#888", textTransform: "uppercase", letterSpacing: "1px" }}>Total Votes</span>
              <span style={{ fontSize: "28px", color: "#fff", fontWeight: "bold", marginTop: "4px" }}>{productA.votesCount} votes</span>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err: unknown) {
    console.error("OpenGraph image API rendering error:", err);
    return new Response("Failed to generate image", { status: 500 });
  }
}
