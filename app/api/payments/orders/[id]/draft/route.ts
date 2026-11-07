import { authenticatePaymentRequest, jsonError, readJsonRequest } from "@/lib/server/auth";
import { getLaunchOrderDraft, saveLaunchOrderDraft } from "@/lib/server/launchPayments";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await authenticatePaymentRequest(request);
    return Response.json(await getLaunchOrderDraft(user.id, (await context.params).id), { headers });
  } catch (error) { return jsonError(error); }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await authenticatePaymentRequest(request);
    const draft = await readJsonRequest(request, 128_000);
    return Response.json(await saveLaunchOrderDraft(user.id, (await context.params).id, draft), { headers });
  } catch (error) { return jsonError(error); }
}
