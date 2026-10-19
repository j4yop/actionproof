import { describe, expect, it } from "vitest";
import { getExample } from "@/domain/actionproof/examples";
import { buildExplorerModel, relatedEventIds } from "@/domain/actionproof/explorer";
import { verify } from "@/domain/actionproof/verify";
import type { VerificationContext } from "@/domain/actionproof/types";

const context: VerificationContext = {
  verificationId: "verification-explorer-test",
  createdAt: "2026-10-19T10:00:00.000Z",
  contractHash: "contract-hash",
  evidenceHash: "evidence-hash",
  verifierVersion: "1.0.0",
  profileId: "profile-test",
  profileHash: "profile-hash",
};

function run(key: string) {
  const example = getExample(key);
  if (!example) throw new Error(`missing example ${key}`);
  return { result: verify(example.contract, example.evidence, context), events: example.evidence.events };
}

describe("evidence explorer model", () => {
  it("maps the unsafe bypass event to the assertion that forbids it", () => {
    const { result, events } = run("unsafe");
    const model = buildExplorerModel(result, events);

    const bypass = model.events.find((entry) => entry.event.eventId === "bypass");
    expect(bypass).toBeDefined();
    expect(bypass!.unsafe).toBe(true);
    expect(bypass!.decisive).toBe(true);
    expect(bypass!.affectedAssertionIds).toContain("no-privileged-bypass");
    expect(model.decisiveEventIds).toContain("bypass");
  });

  it("walks the link in both directions: event → assertions → events", () => {
    const { result, events } = run("unsafe");
    const model = buildExplorerModel(result, events);

    // The order assertion binds the confirmation and submit events together,
    // so selecting one highlights the other.
    const orderAssertion = result.assertionResults.find((assertion) => assertion.assertionId === "confirmed-before-submit");
    expect(orderAssertion?.evidenceEventIds).toEqual(expect.arrayContaining(["confirmation", "submit"]));

    const related = relatedEventIds(model, "confirmation");

    expect(related).toContain("confirmation");
    expect(related).toContain("submit");
  });

  it("lists assertions with no linked events as not observed", () => {
    const { result, events } = run("false-success");
    const model = buildExplorerModel(result, events);

    expect(model.unobservedAssertions.length).toBeGreaterThan(0);
    expect(model.unobservedAssertions.some((assertion) => assertion.reasonCode === "EVENT_COUNT_OUT_OF_RANGE")).toBe(true);
  });

  it("marks nothing decisive on a clean pass", () => {
    const { result, events } = run("pass");
    const model = buildExplorerModel(result, events);

    expect(model.decisiveEventIds).toEqual([]);
    expect(model.unobservedAssertions).toEqual([]);
    expect(model.eventTypes.length).toBeGreaterThan(0);
  });

  it("flags policy blocks as blocked and decisive", () => {
    const { result, events } = run("policy-block");
    const model = buildExplorerModel(result, events);

    const blockedEvent = model.events.find((entry) => entry.event.type === "policy.blocked");
    expect(blockedEvent).toBeDefined();
    expect(blockedEvent!.blocked).toBe(true);
    expect(blockedEvent!.decisive).toBe(true);
    expect(result.status).toBe("BLOCKED");
  });

  it("surfaces coverage gaps from the verification result", () => {
    const example = getExample("inconclusive");
    expect(example).toBeDefined();
    const withGap = {
      ...example!.evidence,
      coverage: {
        ...example!.evidence.coverage,
        gaps: [{ fromSequence: 4, toSequence: 7, reason: "collector restart" }],
      },
    };
    const result = verify(example!.contract, withGap, context);
    const model = buildExplorerModel(result, withGap.events);

    expect(model.events.length).toBe(withGap.events.length);
    expect(result.coverage.gaps?.[0]?.reason).toBe("collector restart");
  });
});
