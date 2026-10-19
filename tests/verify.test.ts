import { describe, expect, it } from "vitest";
import { getExample } from "@/domain/actionproof/examples";
import { VerificationInputError, verify } from "@/domain/actionproof/verify";
import type { EvidenceEvent, VerificationContext } from "@/domain/actionproof/types";
import { hashBundle, hashEvent } from "@/domain/actionproof/integrity";

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
      sequence: 10,
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
    evidence.coverage.endSequence = 10;
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

  it("verifies a complete event chain and bundle hash before allowing PASS", () => {
    const fixture = getExample("pass");
    expect(fixture).toBeDefined();
    const contract = structuredClone(fixture!.contract);
    contract.capture.integrity = "hash-chain";
    const evidence = structuredClone(fixture!.evidence);
    evidence.provenance.integrity = { canonicalization: "jcs", hashAlgorithm: "sha-256", chain: "event-hash-chain" };

    let previousHash: string | null = null;
    evidence.events = evidence.events.map((event) => {
      const eventHash = hashEvent(event, previousHash);
      previousHash = eventHash;
      return { ...event, integrity: { eventHash, ...(previousHash ? {} : {}) } };
    });
    evidence.events = evidence.events.map((event, index, allEvents) => ({
      ...event,
      integrity: {
        eventHash: event.integrity!.eventHash,
        ...(index > 0 ? { previousEventHash: allEvents[index - 1].integrity!.eventHash } : {}),
      },
    }));
    evidence.provenance.integrity.bundleHash = hashBundle(evidence);

    const result = verify(contract, evidence, context);

    expect(result.status).toBe("PASS");
    expect(result.evidence.integrity.chain).toBe("verified");
    expect(result.evidence.integrity.bundle).toBe("verified");
    expect(result.evidence.provenance).toBe("tamper-evident");
  });

  it("fails closed when a verified event payload is mutated", () => {
    const fixture = getExample("pass");
    expect(fixture).toBeDefined();
    const contract = structuredClone(fixture!.contract);
    contract.capture.integrity = "hash-chain";
    const evidence = structuredClone(fixture!.evidence);
    evidence.provenance.integrity = { canonicalization: "jcs", hashAlgorithm: "sha-256", chain: "event-hash-chain" };
    let previousHash: string | null = null;
    evidence.events = evidence.events.map((event) => {
      const eventHash = hashEvent(event, previousHash);
      const next = { ...event, integrity: { eventHash, ...(previousHash ? { previousEventHash: previousHash } : {}) } };
      previousHash = eventHash;
      return next;
    });
    evidence.provenance.integrity.bundleHash = hashBundle(evidence);
    evidence.events[2].payload.action = { name: "different-action" };

    const result = verify(contract, evidence, context);

    expect(result.status).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toContain("EVENT_HASH_MISMATCH");
  });

  it("does not let an arbitrary blocked payload change the verdict", () => {
    const fixture = getExample("pass");
    expect(fixture).toBeDefined();
    const evidence = structuredClone(fixture!.evidence);
    evidence.events.push({
      eventId: "network-response",
      sequence: 10,
      type: "network.response",
      occurredAt: "2026-10-19T09:00:08.500Z",
      actor: { kind: "browser" },
      payload: { outcome: "blocked" },
      source: { sourceId: "browser", sourceKind: "browser-instrumentation", sourceVersion: "1.0.0", capturedAt: "2026-10-19T09:00:08.500Z" },
    });
    evidence.coverage.endSequence = 10;
    evidence.coverage.observedEventTypes.push("network.response");

    const result = verify(fixture!.contract, evidence, context);

    expect(result.status).toBe("PASS");
    expect(result.reasonCodes).not.toContain("EXPLICIT_POLICY_BLOCK");
  });

  it("fails closed when a declared scope has no corresponding evidence", () => {
    const fixture = getExample("pass");
    expect(fixture).toBeDefined();
    const contract = structuredClone(fixture!.contract);
    contract.scope = { allowedOrigins: ["https://shop.example"], allowedCapabilities: ["click"] };
    const evidence = structuredClone(fixture!.evidence);
    evidence.events = evidence.events.filter((event) => !event.type.startsWith("capability"));
    evidence.coverage.endSequence = Math.max(...evidence.events.map((event) => event.sequence));
    evidence.coverage.observedEventTypes = [...new Set(evidence.events.map((event) => event.type))];

    const result = verify(contract, evidence, context);

    expect(result.status).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toContain("CAPABILITY_BINDING_MISSING");
  });

  it("does not treat inherited object properties as JSON evidence", () => {
    const fixture = getExample("pass");
    expect(fixture).toBeDefined();
    const contract = structuredClone(fixture!.contract);
    contract.assertions = [{
      id: "no-inherited-property",
      kind: "event-present",
      required: true,
      selector: { type: "session.started", where: [{ path: "/payload/toString", op: "exists", value: true }] },
    }];

    const result = verify(contract, fixture!.evidence, context);

    expect(result.status).toBe("DRIFT");
  });

  it("requires a run end timestamp for complete coverage", () => {
    const fixture = getExample("pass");
    expect(fixture).toBeDefined();
    const evidence = structuredClone(fixture!.evidence);
    delete evidence.run.endedAt;

    const result = verify(fixture!.contract, evidence, context);

    expect(result.status).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toContain("RUN_END_MISSING");
  });

  it("does not let an optional unevaluable assertion block a valid result", () => {
    const fixture = getExample("pass");
    expect(fixture).toBeDefined();
    const contract = structuredClone(fixture!.contract);
    contract.assertions.push({
      id: "optional-screenshot-check",
      kind: "event-present",
      required: false,
      selector: { type: "screenshot.captured" },
    });
    const evidence = structuredClone(fixture!.evidence);

    const result = verify(contract, evidence, context);

    expect(result.status).toBe("PASS");
    expect(result.assertionResults.find((assertion) => assertion.assertionId === "optional-screenshot-check")?.status).toBe("failed");
  });

  it("rejects an event that occurs outside the declared run window", () => {
    const fixture = getExample("pass");
    expect(fixture).toBeDefined();
    const evidence = structuredClone(fixture!.evidence);
    evidence.events[1].occurredAt = "2026-10-19T08:59:59.000Z";

    const result = verify(fixture!.contract, evidence, context);

    expect(result.status).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toContain("EVENT_OUTSIDE_RUN");
  });
});
