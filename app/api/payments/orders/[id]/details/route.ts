import { authenticatePaymentRequest, jsonError, readJsonRequest } from "@/lib/server/auth";
import { consumeLaunchRateLimit, parseLaunchDetails, saveLaunchDetails } from "@/lib/server/launchPayments";
import { after } from "next/server";
import { deliverSubmissionConfirmation } from "@/lib/server/confirmationEmails";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, client } = await authenticatePaymentRequest(request);
    const input = parseLaunchDetails(await readJsonRequest(request, 128_000));
    await consumeLaunchRateLimit(client, "launch_details");
    const result = await saveLaunchDetails(user.id, (await context.params).id, input);
    after(() => deliverSubmissionConfirmation(result.orderId));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
