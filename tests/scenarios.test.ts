import { describe, expect, it } from "vitest";
import { examples } from "@/domain/actionproof/examples";
import { contractSchema, evidenceSchema } from "@/domain/actionproof/schemas";
import { verify } from "@/domain/actionproof/verify";
import type { VerificationContext } from "@/domain/actionproof/types";

const context: VerificationContext = {
  verificationId: "verification-scenarios-test",
  createdAt: "2026-10-19T10:00:00.000Z",
  contractHash: "contract-hash",
  evidenceHash: "evidence-hash",
  verifierVersion: "1.0.0",
  profileId: "profile-test",
  profileHash: "profile-hash",
};

const expectedVerdicts: Record<string, { status: string; reasonCode: string }> = {
  pass: { status: "PASS", reasonCode: "ASSERTION_PASSED" },
  drift: { status: "DRIFT", reasonCode: "EVENT_COUNT_OUT_OF_RANGE" },
  "false-success": { status: "DRIFT", reasonCode: "EVENT_COUNT_OUT_OF_RANGE" },
  "wrong-origin": { status: "DRIFT", reasonCode: "ORIGIN_OUTSIDE_SCOPE" },
  "duplicate-submission": { status: "DRIFT", reasonCode: "EVENT_COUNT_OUT_OF_RANGE" },
  "out-of-order": { status: "DRIFT", reasonCode: "EVENT_ORDER_WRONG" },
  unsafe: { status: "UNSAFE_BYPASS", reasonCode: "EVENT_FORBIDDEN" },
  "disabled-bypass": { status: "UNSAFE_BYPASS", reasonCode: "EVENT_FORBIDDEN" },
  "policy-block": { status: "BLOCKED", reasonCode: "EXPLICIT_POLICY_BLOCK" },
  "hash-mismatch": { status: "INCONCLUSIVE", reasonCode: "EVENT_HASH_MISMATCH" },
  "hidden-tab": { status: "INCONCLUSIVE", reasonCode: "COVERAGE_INCOMPLETE" },
  inconclusive: { status: "INCONCLUSIVE", reasonCode: "COVERAGE_INCOMPLETE" },
};

describe("adversarial scenario gallery", () => {
  it("exposes a verified path and an adversarial gallery", () => {
    expect(examples.pass.category).toBe("verified");
    const adversarial = Object.values(examples).filter((example) => example.category === "adversarial");
    expect(adversarial.length).toBeGreaterThanOrEqual(8);
    expect(adversarial.every((example) => ["drift", "unsafe", "blocked", "inconclusive"].includes(example.tone))).toBe(true);
  });

  it("produces schema-valid contracts and evidence for every scenario", () => {
    for (const [name, example] of Object.entries(examples)) {
      expect(contractSchema.safeParse(example.contract).success, `contract schema for ${name}`).toBe(true);
      expect(evidenceSchema.safeParse(example.evidence).success, `evidence schema for ${name}`).toBe(true);
    }
  });

  it("gives every scenario its documented decisive verdict through the live verifier path", () => {
    for (const [name, expected] of Object.entries(expectedVerdicts)) {
      const example = examples[name];
      expect(example, `scenario ${name} exists`).toBeDefined();

      const result = verify(example.contract, example.evidence, context);

      expect(result.status, `${name} status`).toBe(expected.status);
      expect(result.reasonCodes, `${name} reason codes`).toContain(expected.reasonCode);
    }
  });

  it("keeps the verified checkout fixture passing", () => {
    const result = verify(examples.pass.contract, examples.pass.evidence, context);

    expect(result.status).toBe("PASS");
    expect(result.summary.failed).toBe(0);
    expect(result.summary.unsafe).toBe(0);
  });

  it("fails closed on the tampered hash-chain bundle instead of repairing it", () => {
    const result = verify(examples["hash-mismatch"].contract, examples["hash-mismatch"].evidence, context);

    expect(result.status).toBe("INCONCLUSIVE");
    expect(result.evidence.integrity.chain).toBe("mismatch");
    expect(result.evidence.provenance).toBe("unverified");
  });

  it("never lets a successful-looking final state override an unsafe classification", () => {
    for (const name of ["unsafe", "disabled-bypass"] as const) {
      const result = verify(examples[name].contract, examples[name].evidence, context);

      expect(result.status, `${name} status`).toBe("UNSAFE_BYPASS");
      expect(result.summary.unsafeEvents).toBeGreaterThan(0);
    }
  });
});
