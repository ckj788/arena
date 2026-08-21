import { NextResponse } from "next/server";
import { DB_PREFIX } from "@/lib/supabaseClient";
import { authenticateRequest, HttpError, jsonError, readJsonRequest } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

function validId(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-z0-9_-]{1,160}$/i.test(value)) {
    throw new HttpError(400, `${field} is invalid.`);
  }
  return value;
}

function validFeedback(value: unknown, field: string): string {
  if (typeof value !== "string") throw new HttpError(400, `${field} is required.`);
  const normalized = value.trim();
  if (normalized.length < 10 || normalized.length > 1_000) {
    throw new HttpError(400, `${field} must be between 10 and 1000 characters.`);
  }
  return normalized;
}

export async function POST(request: Request) {
  try {
    const { user, client } = await authenticateRequest(request);
    const body = await readJsonRequest(request, 12_000) as Record<string, unknown>;
    const { data, error } = await client.rpc(`${DB_PREFIX}cast_vote`, {
      p_match_id: validId(body.matchId, "Match ID"),
      p_voted_product_id: validId(body.votedProductId, "Product ID"),
      p_feedback_winner: validFeedback(body.winnerFeedback, "Positive feedback"),
      p_feedback_loser: validFeedback(body.loserFeedback, "Constructive feedback"),
    });

    if (error) {
      if (error.code === "23505") throw new HttpError(409, "You have already voted on this matchup.");
      if (error.message.includes("already voted")) throw new HttpError(409, "You have already voted on this matchup.");
      if (error.message.includes("closed") || error.message.includes("active")) {
        throw new HttpError(409, "This matchup is no longer accepting votes.");
      }
      console.error("[ARENA VOTE] Database function failed:", error.message);
      throw new HttpError(500, "Unable to record the vote.");
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result) throw new HttpError(500, "Vote result was empty.");
    return NextResponse.json({
      votesA: Number(result.votes_a),
      votesB: Number(result.votes_b),
      voterId: user.id,
    });
  } catch (error) {
    return jsonError(error);
  }
}
