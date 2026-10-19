import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/verify/route";
import { getExample } from "@/domain/actionproof/examples";
import { verify } from "@/domain/actionproof/verify";
import type { Contract, EvidenceBundle, VerificationContext, VerificationResult } from "@/domain/actionproof/types";

const sampleDir = join(process.cwd(), "samples", "account-recovery");

const contract = JSON.parse(readFileSync(join(sampleDir, "contract.json"), "utf8")) as Contract;
const evidencePass = JSON.parse(readFileSync(join(sampleDir, "evidence-pass.json"), "utf8")) as EvidenceBundle;
const evidenceFalseSuccess = JSON.parse(readFileSync(join(sampleDir, "evidence-false-success.json"), "utf8")) as EvidenceBundle;

const context: VerificationContext = {
  verificationId: "verification-liveness",
  createdAt: "2026-10-20T10:00:00.000Z",
  contractHash: "contract-hash",
  evidenceHash: "evidence-hash",
  verifierVersion: "1.0.0",
  profileId: "profile-test",
  profileHash: "profile-hash",
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** The one event that separates the passing run from the false-success run. */
const missingRequest = {
  eventId: "recovery-request",
  sequence: 8,
  type: "network.request",
  occurredAt: "2026-10-20T09:00:09.000Z",
  actor: { kind: "browser-agent" as const, ref: "agent/support-demo" },
  payload: { method: "POST", path: "/api/account/recovery", status: 202 },
  source: {
    sourceId: "collector/support",
    sourceKind: "browser-instrumentation" as const,
    sourceVersion: "1.1.0",
    capturedAt: "2026-10-20T09:00:09.000Z",
  },
};

/** Renumbers sequences contiguously and realigns the declared coverage window. */
function renumber(bundle: EvidenceBundle): EvidenceBundle {
  const events = bundle.events.map((event, index) => ({ ...event, sequence: index + 1 }));
  return {
    ...bundle,
    events,
    coverage: {
      ...bundle.coverage,
      startSequence: events[0]?.sequence,
      endSequence: events[events.length - 1]?.sequence,
      observedEventTypes: [...new Set(events.map((event) => event.type))],
    },
  };
}

function withNetworkRequest(): EvidenceBundle {
  const bundle = clone(evidenceFalseSuccess);
  bundle.events = bundle.events.flatMap((event) => (event.eventId === "confirmation-shown" ? [missingRequest, event] : [event]));
  return renumber(bundle);
}

describe("verdicts are computed live from the payload", () => {
  it("returns DRIFT for the false-success sample, because the server request is absent", () => {
    const result = verify(contract, evidenceFalseSuccess, context);

    expect(result.status).toBe("DRIFT");
    const decisive = result.assertionResults.find((assertion) => assertion.assertionId === "recovery-request-sent");
    expect(decisive?.status).toBe("failed");
    expect(decisive?.reasonCode).toBe("EVENT_COUNT_OUT_OF_RANGE");
    expect(decisive?.evidenceEventIds).toEqual([]);
  });

  it("flips to PASS when the missing server request is actually present", () => {
    const result = verify(contract, withNetworkRequest(), context);

    expect(result.status).toBe("PASS");
    const decisive = result.assertionResults.find((assertion) => assertion.assertionId === "recovery-request-sent");
    expect(decisive?.status).toBe("passed");
    expect(decisive?.evidenceEventIds).toContain("recovery-request");
  });

  it("flips to UNSAFE_BYPASS when a forbidden capability appears", () => {
    const bundle = clone(evidencePass);
    bundle.events.push({
      eventId: "mail-relay",
      sequence: 11,
      type: "capability.used",
      occurredAt: "2026-10-20T09:00:11.000Z",
      actor: { kind: "browser-agent", ref: "agent/support-demo" },
      payload: { capability: "smtp-relay", target: "support@example.com" },
      source: {
        sourceId: "collector/support",
        sourceKind: "browser-instrumentation",
        sourceVersion: "1.1.0",
        capturedAt: "2026-10-20T09:00:11.000Z",
      },
    });
    bundle.coverage = { ...bundle.coverage, endSequence: 11 };

    const result = verify(contract, bundle, context);

    expect(result.status).toBe("UNSAFE_BYPASS");
    expect(result.summary.unsafeEvents).toBeGreaterThan(0);
    expect(result.reasonCodes).toContain("EVENT_FORBIDDEN");
  });

  it("flips to INCONCLUSIVE when the capture is no longer complete", () => {
    const bundle = clone(evidencePass);
    bundle.coverage = { ...bundle.coverage, mode: "partial", startSequence: undefined, endSequence: undefined };

    const result = verify(contract, bundle, context);

    expect(result.status).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toContain("COVERAGE_INCOMPLETE");
  });

  it("flips to DRIFT with an ordering reason when the steps are reversed", () => {
    const bundle = clone(evidencePass);
    bundle.events = bundle.events.map((event) => {
      if (event.eventId === "identity-checked") {
        return { ...event, sequence: 7, occurredAt: "2026-10-20T09:00:08.000Z" };
      }
      if (event.eventId === "password-reset") {
        return { ...event, sequence: 5, occurredAt: "2026-10-20T09:00:05.000Z" };
      }
      return event;
    });

    const result = verify(contract, bundle, context);

    expect(result.status).toBe("DRIFT");
    expect(result.reasonCodes).toContain("EVENT_ORDER_WRONG");
  });

  it("flips to DRIFT with a scope reason when the agent works on another origin", () => {
    const bundle = clone(evidencePass);
    bundle.events = bundle.events.map((event) =>
      event.eventId === "recovery-page-opened"
        ? { ...event, payload: { url: { origin: "https://phish.example", path: "/account/recovery" } } }
        : event,
    );

    const result = verify(contract, bundle, context);

    expect(result.status).toBe("DRift".toUpperCase());
    expect(result.reasonCodes).toContain("ORIGIN_OUTSIDE_SCOPE");
  });

  it("never returns a constant verdict for changing input", () => {
    const verdicts = new Set<string>();
    verdicts.add(verify(contract, evidencePass, context).status);
    verdicts.add(verify(contract, evidenceFalseSuccess, context).status);
    verdicts.add(verify(contract, withNetworkRequest(), context).status);
    verdicts.add(verify(contract, { ...clone(evidencePass), coverage: { ...evidencePass.coverage, mode: "partial" } }, context).status);

    expect(verdicts.size).toBeGreaterThan(1);
    expect([...verdicts].sort()).toEqual(["DRIFT", "INCONCLUSIVE", "PASS"]);
  });

  it("is deterministic for the same input", () => {
    const first = verify(contract, evidenceFalseSuccess, context);
    const second = verify(contract, evidenceFalseSuccess, context);

    expect(second.status).toBe(first.status);
    expect(second.reasonCodes).toEqual(first.reasonCodes);
    expect(second.assertionResults).toEqual(first.assertionResults);
  });

  it("computes the same verdict over HTTP as it does in the domain", async () => {
    const response = await POST(new Request("http://localhost/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "liveness-test" },
      body: JSON.stringify({ contract, evidence: evidenceFalseSuccess }),
    }));
    const body = (await response.json()) as { result: VerificationResult };

    expect(response.status).toBe(200);
    expect(body.result.status).toBe("DRIFT");
    expect(body.result.reasonCodes).toContain("EVENT_COUNT_OUT_OF_RANGE");

    const passResponse = await POST(new Request("http://localhost/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "liveness-test" },
      body: JSON.stringify({ contract, evidence: evidencePass }),
    }));
    const passBody = (await passResponse.json()) as { result: VerificationResult };

    expect(passBody.result.status).toBe("PASS");
  });

  it("keeps the shipped sample files identical to the in-app gallery presets", () => {
    const galleryPass = getExample("recovery-pass");
    const galleryFalseSuccess = getExample("recovery-false-success");

    expect(galleryPass).toBeDefined();
    expect(galleryFalseSuccess).toBeDefined();

    // The sample files and the gallery presets must not drift apart.
    expect(JSON.parse(JSON.stringify(galleryPass!.contract))).toEqual(contract);
    expect(JSON.parse(JSON.stringify(galleryPass!.evidence))).toEqual(evidencePass);
    expect(JSON.parse(JSON.stringify(galleryFalseSuccess!.evidence))).toEqual(evidenceFalseSuccess);
  });
});
