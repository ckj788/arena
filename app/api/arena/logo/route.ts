import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { PRODUCT_LOGO_BUCKET } from "@/lib/site";
import {
  authenticateRequest,
  consumeUserRateLimit,
  getAdminClient,
  HttpError,
  jsonError,
} from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

function hasValidSignature(bytes: Uint8Array, contentType: keyof typeof IMAGE_TYPES) {
  if (contentType === "image/png") {
    return bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export async function POST(request: Request) {
  try {
    const { user, client } = await authenticateRequest(request);
    await consumeUserRateLimit(client, "logo");

    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (!contentType || !(contentType in IMAGE_TYPES)) {
      throw new HttpError(415, "Logo must be a PNG, JPEG, or WebP image.");
    }

    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > 1_000_000) throw new HttpError(413, "Logo must be smaller than 1 MB.");

    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 1_000_000) {
      throw new HttpError(413, "Logo must be between 1 byte and 1 MB.");
    }
    if (!hasValidSignature(bytes, contentType as keyof typeof IMAGE_TYPES)) {
      throw new HttpError(400, "The uploaded file does not match its image type.");
    }

    const extension = IMAGE_TYPES[contentType as keyof typeof IMAGE_TYPES];
    const objectPath = `${user.id}/${randomUUID()}.${extension}`;
    const admin = getAdminClient();
    const { error: uploadError } = await admin.storage
      .from(PRODUCT_LOGO_BUCKET)
      .upload(objectPath, bytes, {
        cacheControl: "31536000",
        contentType,
        upsert: false,
      });
    if (uploadError) {
      console.error("[ARENA LOGO] Storage upload failed:", uploadError.message);
      throw new HttpError(500, "Unable to store the product logo.");
    }

    const { data } = admin.storage.from(PRODUCT_LOGO_BUCKET).getPublicUrl(objectPath);
    return NextResponse.json({ url: data.publicUrl }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
