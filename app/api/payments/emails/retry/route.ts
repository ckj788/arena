import { requireCronSecret, jsonError } from "@/lib/server/auth";
import { dispatchConfirmationEmails } from "@/lib/server/confirmationEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    requireCronSecret(request);
    return Response.json(await dispatchConfirmationEmails(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}

// Supports authenticated scheduler GETs as well as manual server-side POSTs.
export const GET = POST;
