import { describe, expect, it } from "vitest";
import { contractSchema } from "@/domain/actionproof/schemas";
import { getExample } from "@/domain/actionproof/examples";
import { verify } from "@/domain/actionproof/verify";
import { compileContract, defaultDraft, validateDraft, type WizardDraft } from "@/domain/actionproof/wizard";
import type { VerificationContext } from "@/domain/actionproof/types";

const context: VerificationContext = {
  verificationId: "verification-wizard-test",
  createdAt: "2026-10-19T10:00:00.000Z",
  contractHash: "contract-hash",
  evidenceHash: "evidence-hash",
  verifierVersion: "1.0.0",
  profileId: "profile-test",
  profileHash: "profile-hash",
};

const COMPILED_AT = "2026-10-19T10:00:00.000Z";

function hasPredicateValue(selector: { where?: Array<{ path: string; value?: unknown; values?: unknown[] }> | undefined }, value: unknown): boolean {
  return selector.where?.some((predicate) => predicate.value === value || predicate.values?.includes(value)) ?? false;
}

describe("contract wizard compiler", () => {
  it("compiles the default checkout draft into a schema-valid contract", () => {
    const contract = compileContract(defaultDraft("checkout"), COMPILED_AT);

    const parsed = contractSchema.safeParse(contract);
    expect(parsed.success).toBe(true);
  });

  it("produces the same verifier verdict as the hand-authored fixture for the same evidence", () => {
    const fixture = getExample("pass");
    expect(fixture).toBeDefined();

    const wizardContract = compileContract(defaultDraft("checkout"), COMPILED_AT);
    const wizardEvidence = { ...fixture!.evidence, contractRef: { contractId: wizardContract.contractId, revision: wizardContract.revision } };

    const wizardResult = verify(wizardContract, wizardEvidence, context);
    const handResult = verify(fixture!.contract, fixture!.evidence, context);

    expect(wizardResult.status).toBe("PASS");
    expect(wizardResult.status).toBe(handResult.status);
    expect(wizardResult.summary.failed).toBe(handResult.summary.failed);
    expect(wizardResult.summary.blocked).toBe(handResult.summary.blocked);
    expect(wizardResult.summary.unsafe).toBe(handResult.summary.unsafe);
    expect(wizardResult.summary.unsafeEvents).toBe(handResult.summary.unsafeEvents);
    expect(wizardResult.assertionResults.every((assertion) => assertion.status === "passed")).toBe(true);
  });

  it("marks the submit action as at most once when the guard is enabled", () => {
    const draft = defaultDraft("checkout");
    const contract = compileContract(draft, COMPILED_AT);

    const submit = contract.assertions.find((assertion) => assertion.kind === "event-present" && hasPredicateValue(assertion.selector, "submit-order"));
    expect(submit).toBeDefined();
    expect(submit && submit.kind === "event-present" ? submit.max : undefined).toBe(1);
  });

  it("omits the count cap when the at-most-once guard is disabled", () => {
    const draft = defaultDraft("checkout");
    draft.actions = draft.actions.map((action) => ({ ...action, atMostOnce: false }));
    const contract = compileContract(draft, COMPILED_AT);

    const submit = contract.assertions.find((assertion) => assertion.kind === "event-present" && hasPredicateValue(assertion.selector, "submit-order"));
    expect(submit && submit.kind === "event-present" ? submit.max : undefined).toBeUndefined();
  });

  it("chains event-order assertions only when ordering is enforced", () => {
    const ordered = compileContract(defaultDraft("checkout"), COMPILED_AT);
    expect(ordered.assertions.filter((assertion) => assertion.kind === "event-order").length).toBe(1);

    const unorderedDraft = defaultDraft("checkout");
    unorderedDraft.enforceActionOrder = false;
    const unordered = compileContract(unorderedDraft, COMPILED_AT);
    expect(unordered.assertions.filter((assertion) => assertion.kind === "event-order").length).toBe(0);
  });

  it("omits the forbidden-capability assertion when nothing is forbidden", () => {
    const draft = defaultDraft("checkout");
    draft.forbiddenCapabilities = [];
    const contract = compileContract(draft, COMPILED_AT);

    expect(contract.assertions.some((assertion) => assertion.kind === "forbidden-event")).toBe(false);
  });

  it("adds an event-absent assertion when the absent-event rule is enabled", () => {
    const draft = defaultDraft("checkout");
    draft.absentEvent = { enabled: true, eventType: "navigation.committed", path: "/payload/url/path", value: "/admin" };
    const contract = compileContract(draft, COMPILED_AT);

    const absent = contract.assertions.find((assertion) => assertion.kind === "event-absent");
    expect(absent).toBeDefined();
    if (absent?.kind === "event-absent") {
      expect(absent.selector.type).toBe("navigation.committed");
      expect(absent.selector.where).toEqual([{ path: "/payload/url/path", op: "eq", value: "/admin" }]);
    }
  });

  it("reflects a changed origin in the scope and the navigation predicate", () => {
    const draft: WizardDraft = { ...defaultDraft("checkout"), origin: "https://legacy.example" };
    const contract = compileContract(draft, COMPILED_AT);

    expect(contract.scope?.allowedOrigins).toEqual(["https://legacy.example"]);
    const opened = contract.assertions.find((assertion) => assertion.kind === "event-present" && assertion.selector.type === "navigation.committed");
    expect(opened && opened.kind === "event-present" ? hasPredicateValue(opened.selector, "https://legacy.example") : false).toBe(true);
  });

  it("reports issues for an unreachable origin and an empty enabled action", () => {
    const draft = defaultDraft("checkout");
    draft.origin = "not-a-url";
    draft.actions[0].name = "  ";

    const issues = validateDraft(draft);

    expect(issues.some((issue) => issue.path === "origin")).toBe(true);
    expect(issues.some((issue) => issue.path === "actions")).toBe(true);
  });

  it("reports no issues for every preset with default answers", () => {
    for (const key of ["checkout", "form", "navigation", "data-extraction", "account-change"] as const) {
      expect(validateDraft(defaultDraft(key))).toEqual([]);
    }
  });
});
