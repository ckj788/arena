import { paymentConfiguration } from "@/lib/server/stripe";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ configured: paymentConfiguration() }, { headers: { "Cache-Control": "no-store" } });
}
