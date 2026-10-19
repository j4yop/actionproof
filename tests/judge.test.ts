import { describe, expect, it } from "vitest";
import { examples, getExample } from "@/domain/actionproof/examples";
import { decisiveAssertion, JUDGE_STEPS } from "@/domain/actionproof/judge";
import { verify } from "@/domain/actionproof/verify";
import type { VerificationContext } from "@/domain/actionproof/types";

const context: VerificationContext = {
  verificationId: "verification-judge-test",
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
  return verify(example.contract, example.evidence, context);
}

describe("judge mode", () => {
  it("walks the documented demo sequence: PASS → UNSAFE_BYPASS → INCONCLUSIVE", () => {
    expect(JUDGE_STEPS.map((step) => step.exampleKey)).toEqual(["pass", "unsafe", "inconclusive"]);
    const statuses = JUDGE_STEPS.map((step) => run(step.exampleKey).status);
    expect(statuses).toEqual(["PASS", "UNSAFE_BYPASS", "INCONCLUSIVE"]);
  });

  it("binds every judge step to a real gallery example", () => {
    for (const step of JUDGE_STEPS) {
      expect(getExample(step.exampleKey), step.exampleKey).toBeDefined();
    }
  });

  it("links the unsafe step to its decisive forbidden event, not the happy path", () => {
    const result = run("unsafe");
    const decisive = decisiveAssertion(result);

    expect(decisive?.status).toBe("unsafe");
    expect(decisive?.reasonCode).toBe("EVENT_FORBIDDEN");
    expect(decisive?.evidenceEventIds).toContain("bypass");
  });

  it("links the inconclusive step to the coverage refusal", () => {
    const result = run("inconclusive");
    const decisive = decisiveAssertion(result);

    expect(result.reasonCodes).toContain("COVERAGE_INCOMPLETE");
    expect(decisive?.status).toBe("not-evaluable");
  });

  it("has no decisive assertion on a clean pass", () => {
    const result = run("pass");

    expect(decisiveAssertion(result)).toBeUndefined();
    expect(Object.keys(examples)).toContain("pass");
  });
});
