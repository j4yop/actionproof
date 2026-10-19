import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { contractSchema, evidenceSchema } from "@/domain/actionproof/schemas";
import { stableStringify } from "@/domain/actionproof/stable-json";
import { VerificationInputError, verify } from "@/domain/actionproof/verify";

const MAX_BODY_BYTES = 512_000;
const VERIFIER_VERSION = "1.0.0";
const PROFILE_ID = "actionproof-web-v1";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const requestBuckets = new Map<string, { startedAt: number; count: number }>();

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many verification requests. Try again shortly." } }, { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } });
  }

  let rawBody: string;
  try {
    rawBody = await readBodyWithinLimit(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json({ error: { code: "BODY_TOO_LARGE", message: "Use a JSON payload smaller than 512 KB." } }, { status: 413 });
    }
    return NextResponse.json({ error: { code: "REQUEST_BODY_UNREADABLE", message: "The request body could not be read." } }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "The request body is not valid JSON." } }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: { code: "INVALID_PAYLOAD", message: "Send an object containing contract and evidence." } }, { status: 422 });
  }

  const input = payload as { contract?: unknown; evidence?: unknown };
  const contractResult = contractSchema.safeParse(input.contract);
  const evidenceResult = evidenceSchema.safeParse(input.evidence);

  if (!contractResult.success || !evidenceResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "SCHEMA_VALIDATION_FAILED",
          message: "The contract or evidence bundle does not match ActionProof v1.",
          issues: [
            ...(contractResult.success ? [] : contractResult.error.issues.map((issue) => ({ path: ["contract", ...issue.path], message: issue.message }))),
            ...(evidenceResult.success ? [] : evidenceResult.error.issues.map((issue) => ({ path: ["evidence", ...issue.path], message: issue.message }))),
          ],
        },
      },
      { status: 422 },
    );
  }

  const contract = contractResult.data;
  const evidence = evidenceResult.data;
  const profile = { id: PROFILE_ID, verifierVersion: VERIFIER_VERSION };

  try {
    const result = verify(contract, evidence, {
      verificationId: randomUUID(),
      createdAt: new Date().toISOString(),
      contractHash: sha256(contract),
      evidenceHash: sha256(evidence),
      verifierVersion: VERIFIER_VERSION,
      profileId: PROFILE_ID,
      profileHash: sha256(profile),
    });

    return NextResponse.json({ result }, { status: 200 });
  } catch (error) {
    if (error instanceof VerificationInputError) {
      const status = error.issues.some((issue) => issue.code === "RESOURCE_LIMIT_EXCEEDED") ? 413 : 422;
      return NextResponse.json(
        {
          error: {
            code: "DOMAIN_VALIDATION_FAILED",
            message: error.message,
            issues: error.issues,
          },
        },
        { status },
      );
    }

    console.error("ActionProof verification failed", error);
    return NextResponse.json({ error: { code: "VERIFICATION_FAILED", message: "The verification could not be completed." } }, { status: 500 });
  }
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

class BodyTooLargeError extends Error {}

async function readBodyWithinLimit(request: Request, limit: number): Promise<string> {
  if (!request.body) {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > limit) throw new BodyTooLargeError();
    return body;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function checkRateLimit(request: Request): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const identity = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
  const current = requestBuckets.get(identity);

  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    requestBuckets.set(identity, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - current.startedAt)) / 1000)) };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
