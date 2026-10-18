import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { contractSchema, evidenceSchema } from "@/domain/actionproof/schemas";
import { stableStringify } from "@/domain/actionproof/stable-json";
import { VerificationInputError, verify } from "@/domain/actionproof/verify";

const MAX_BODY_BYTES = 512_000;
const VERIFIER_VERSION = "1.0.0";
const PROFILE_ID = "actionproof-web-v1";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: { code: "BODY_TOO_LARGE", message: "Use a JSON payload smaller than 512 KB." } }, { status: 413 });
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
      return NextResponse.json(
        {
          error: {
            code: "DOMAIN_VALIDATION_FAILED",
            message: error.message,
            issues: error.issues,
          },
        },
        { status: 422 },
      );
    }

    console.error("ActionProof verification failed", error);
    return NextResponse.json({ error: { code: "VERIFICATION_FAILED", message: "The verification could not be completed." } }, { status: 500 });
  }
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
