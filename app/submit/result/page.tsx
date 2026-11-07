import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PublicSiteHeader from "@/app/components/PublicSiteHeader";
import { UUID_PATTERN } from "@/lib/server/launchPayments";
import { isCheckoutSessionId, paymentLinkOrderId } from "@/lib/server/paymentLinks";
import PaymentResult from "./PaymentResult";

export const metadata: Metadata = {
  title: "Your Launch Order",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default async function PaymentResultPage({ searchParams }: {
  searchParams: Promise<{ order?: string | string[]; session_id?: string | string[] }>;
}) {
  const { order, session_id: sessionId } = await searchParams;
  const validSession = isCheckoutSessionId(sessionId) ? sessionId : undefined;
  const linkedOrderId = validSession ? paymentLinkOrderId(validSession) : null;
  const orderId = typeof order === "string" && UUID_PATTERN.test(order) ? order : linkedOrderId;
  if (!orderId) redirect("/submit");
  return <div className="arena-app launch-page min-h-screen px-5">
    <PublicSiteHeader actionHref="/products" actionLabel="Explore products" />
    <PaymentResult orderId={orderId} sessionId={validSession} canReconcile={Boolean(validSession)} />
  </div>;
}
