import type { Metadata } from "next";
import ModerationConsole from "./ModerationConsole";
export const metadata: Metadata = { title: "Moderation | Indie Clash", robots: { index: false, follow: false } };
export default function Page() { return <ModerationConsole />; }
