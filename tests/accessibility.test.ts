import { describe, expect, it } from "vitest";
import { buildAnnouncement, buildErrorSummary, EDITOR_IDS } from "@/domain/actionproof/accessibility";

describe("accessibility feedback", () => {
  it("groups schema issues by the editor they belong to", () => {
    const summary = buildErrorSummary({
      code: "SCHEMA_VALIDATION_FAILED",
      message: "The contract or evidence bundle does not match ActionProof v1.",
      issues: [
        { path: ["contract", "assertions", 0, "id"], message: "Required" },
        { path: ["contract", "scope"], message: "Required" },
        { path: ["evidence", "events"], message: "Required" },
      ],
    });

    expect(summary.map((entry) => entry.field)).toEqual(["contract", "evidence"]);
    expect(summary[0].issueCount).toBe(2);
    expect(summary[1].issueCount).toBe(1);
    expect(summary[0].label).toBe("Contract");
    expect(summary[1].label).toBe("Evidence bundle");
  });

  it("falls back to the reported field when there are no issues", () => {
    const summary = buildErrorSummary({ code: "INVALID_JSON", message: "The contract editor contains invalid JSON.", field: "contract" });

    expect(summary).toHaveLength(1);
    expect(summary[0].field).toBe("contract");
    expect(summary[0].issueCount).toBe(1);
  });

  it("reports unlocated issues against the input as a whole", () => {
    const summary = buildErrorSummary({
      code: "SCHEMA_VALIDATION_FAILED",
      message: "The payload does not match ActionProof v1.",
      issues: [{ path: ["payload"], message: "Required" }],
    });

    expect(summary).toHaveLength(1);
    expect(summary[0].field).toBe("payload");
    expect(summary[0].label).toBe("Input");
  });

  it("does not invent a summary entry for an error that is not about the input", () => {
    const summary = buildErrorSummary({ code: "UNKNOWN_ERROR", message: "Something failed." });

    expect(summary).toEqual([]);
  });

  it("announces the start, the verdict, and the failure", () => {
    expect(buildAnnouncement({ kind: "started" })).toMatch(/verification started/i);
    expect(buildAnnouncement({ kind: "completed", status: "UNSAFE_BYPASS" })).toContain("UNSAFE BYPASS");
    expect(buildAnnouncement({ kind: "failed", message: "The input could not be read." })).toContain("The input could not be read.");
  });

  it("points the focus targets at the real editor ids", () => {
    expect(EDITOR_IDS.contract).toBe("contract");
    expect(EDITOR_IDS.evidence).toBe("evidence-bundle");
  });
});
