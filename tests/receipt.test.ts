import { describe, expect, it } from "vitest";
import { getExample } from "@/domain/actionproof/examples";
import { buildHtmlReceipt, buildShareSummary, receiptFileStem } from "@/domain/actionproof/receipt";
import { verify } from "@/domain/actionproof/verify";
import type { VerificationContext } from "@/domain/actionproof/types";

const context: VerificationContext = {
  verificationId: "verification-receipt-test",
  createdAt: "2026-10-19T10:00:00.000Z",
  contractHash: "contract-hash",
  evidenceHash: "evidence-hash",
  verifierVersion: "1.0.0",
  profileId: "profile-test",
  profileHash: "profile-hash",
};

function runUnsafe() {
  const example = getExample("unsafe");
  if (!example) throw new Error("missing unsafe example");
  return verify(example.contract, example.evidence, context);
}

describe("portable verification receipt", () => {
  it("derives a safe filename stem from the verification ID", () => {
    const result = runUnsafe();
    const stem = receiptFileStem(result);

    expect(stem).toMatch(/^actionproof-receipt-[a-z0-9-]+$/);
    expect(stem).not.toContain(result.verificationId.toLowerCase().slice(0, 8) === "" ? "" : " ");
  });

  it("falls back to a stable stem when the verification ID has no safe characters", () => {
    const result = { ...runUnsafe(), verificationId: "/// ???" };

    expect(receiptFileStem(result)).toBe("actionproof-receipt-verdict");
  });

  it("summarizes the verdict with status, hashes, and verifier profile", () => {
    const result = runUnsafe();
    const summary = buildShareSummary(result);

    expect(summary).toContain(`ActionProof verdict: ${result.status}`);
    expect(summary).toContain(result.verificationId);
    expect(summary).toContain(result.contract.hash);
    expect(summary).toContain(result.evidence.hash);
    expect(summary).toContain(result.verifier.profileId);
    expect(summary).toContain(`${result.summary.unsafe} unsafe`);
    expect(result.summary.unsafe).toBeGreaterThan(0);
  });

  it("renders a self-contained HTML receipt with the decisive assertion", () => {
    const result = runUnsafe();
    const html = buildHtmlReceipt(result);

    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain(result.verificationId);
    expect(html).toContain("UNSAFE_BYPASS");
    expect(html).toContain("no-privileged-bypass");
    expect(html).toContain("EVENT_FORBIDDEN");
    expect(html).toContain("not cryptographically verified");
    expect(html).not.toContain("<link");
    expect(html).not.toContain('src="http');
  });

  it("escapes hostile contract content in the HTML receipt", () => {
    const result = runUnsafe();
    const hostile = {
      ...result,
      assertionResults: result.assertionResults.map((assertion, index) =>
        index === 0 ? { ...assertion, description: "<script>alert('xss')</script>" } : assertion,
      ),
    };
    const html = buildHtmlReceipt(hostile);

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("marks cryptographically verified provenance differently from unverified", () => {
    const result = runUnsafe();
    const verified = buildHtmlReceipt({ ...result, evidence: { ...result.evidence, provenance: "tamper-evident" } });

    expect(verified).toContain("cryptographically verifiable");
    expect(buildHtmlReceipt(result)).toContain("not cryptographically verified");
  });
});
