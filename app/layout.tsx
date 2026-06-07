import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const outfit = Outfit({
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "INDIE CLASH — 1v1 Product Tournament Arena",
  description: "Showcase your indie products in 1v1 colosseum brackets. Ship fast, duel in public, trade deep peer critiques, and rank on the global leaderboard.",
  openGraph: {
    title: "INDIE CLASH — 1v1 Product Tournament Arena",
    description: "Showcase your indie products in 1v1 colosseum brackets. Ship fast, duel in public, trade deep peer critiques, and rank on the global leaderboard.",
    url: "https://www.indieclash.com",
    siteName: "Indie Clash",
    images: [
      {
        url: "https://www.indieclash.com/colosseum_arena_pixel.png",
        width: 1200,
        height: 630,
        alt: "INDIE CLASH Arena Preview",
      }
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "INDIE CLASH — 1v1 Product Tournament Arena",
    description: "Showcase your indie products in 1v1 colosseum brackets. Ship fast, duel in public, trade deep peer critiques, and rank on the global leaderboard.",
    images: ["https://www.indieclash.com/colosseum_arena_pixel.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
