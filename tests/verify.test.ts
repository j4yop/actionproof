import { describe, expect, it } from "vitest";
import { getExample } from "@/domain/actionproof/examples";
import { VerificationInputError, verify } from "@/domain/actionproof/verify";
import type { EvidenceEvent, VerificationContext } from "@/domain/actionproof/types";

const context: VerificationContext = {
  verificationId: "verification-test",
  createdAt: "2026-10-19T10:00:00.000Z",
  contractHash: "contract-hash",
  evidenceHash: "evidence-hash",
  verifierVersion: "1.0.0",
  profileId: "profile-test",
  profileHash: "profile-hash",
};

describe("ActionProof verifier", () => {
  it("passes a complete trace when every contract assertion is observed", () => {
    const fixture = getExample("pass");
    expect(fixture).toBeDefined();

    const result = verify(fixture!.contract, fixture!.evidence, context);

    expect(result.status).toBe("PASS");
    expect(result.summary.passed).toBe(4);
    expect(result.assertionResults.every((assertion) => assertion.evidenceEventIds.length > 0 || assertion.status === "passed")).toBe(true);
  });

  it("returns DRIFT when complete evidence contradicts a required event", () => {
    const fixture = getExample("drift");
    expect(fixture).toBeDefined();

    const result = verify(fixture!.contract, fixture!.evidence, context);

    expect(result.status).toBe("DRIFT");
    expect(result.reasonCodes).toContain("EVENT_COUNT_OUT_OF_RANGE");
    expect(result.assertionResults.find((assertion) => assertion.assertionId === "opened-checkout")?.status).toBe("failed");
  });

  it("gives unsafe bypass precedence over the successful-looking outcome", () => {
    const fixture = getExample("unsafe");
    expect(fixture).toBeDefined();

    const result = verify(fixture!.contract, fixture!.evidence, context);

    expect(result.status).toBe("UNSAFE_BYPASS");
    expect(result.summary.unsafe).toBe(2);
    expect(result.assertionResults.find((assertion) => assertion.assertionId === "no-privileged-bypass")?.evidenceEventIds).toContain("bypass");
  });

  it("fails closed when the collector declares partial coverage", () => {
    const fixture = getExample("inconclusive");
    expect(fixture).toBeDefined();

    const result = verify(fixture!.contract, fixture!.evidence, context);

    expect(result.status).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toContain("COVERAGE_INCOMPLETE");
  });

  it("classifies an explicit policy block separately from drift", () => {
    const fixture = getExample("pass");
    expect(fixture).toBeDefined();
    const evidence = structuredClone(fixture!.evidence);
    const blockedEvent: EvidenceEvent = {
      eventId: "policy-blocked",
      sequence: 7,
      type: "policy.blocked",
      occurredAt: "2026-10-19T09:00:08.500Z",
      actor: { kind: "policy-gate", ref: "policy/checkout" },
      payload: { outcome: "blocked", reason: "confirmation-required" },
      source: {
        sourceId: "policy-gate/checkout",
        sourceKind: "policy-gate",
        sourceVersion: "2.0.0",
        capturedAt: "2026-10-19T09:00:08.500Z",
      },
    };
    evidence.events.push(blockedEvent);
    evidence.coverage.observedEventTypes.push(blockedEvent.type);

    const result = verify(fixture!.contract, evidence, context);

    expect(result.status).toBe("BLOCKED");
    expect(result.reasonCodes).toContain("EXPLICIT_POLICY_BLOCK");
  });

  it("rejects evidence that points to a different contract revision", () => {
    const fixture = getExample("pass");
    expect(fixture).toBeDefined();
    const evidence = structuredClone(fixture!.evidence);
    evidence.contractRef.revision = 99;

    expect(() => verify(fixture!.contract, evidence, context)).toThrow(VerificationInputError);
  });

  it("is stable for the same inputs and verifier context", () => {
    const fixture = getExample("pass");
    expect(fixture).toBeDefined();

    const first = verify(fixture!.contract, fixture!.evidence, context);
    const second = verify(fixture!.contract, fixture!.evidence, context);

    expect(second).toEqual(first);
  });
});
