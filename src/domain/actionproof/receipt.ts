import type { VerificationResult } from "./types";

/**
 * Portable verification receipts.
 *
 * A verdict should remain useful after the browser tab closes. These helpers
 * produce the human-readable HTML receipt, a compact share summary, and safe
 * filename stems — all derived purely from the verification result.
 */

export function receiptFileStem(result: VerificationResult): string {
  const safe = result.verificationId.toLowerCase().replaceAll(/[^a-z0-9-]+/g, "-").replaceAll(/^-+|-+$/g, "");
  return `actionproof-receipt-${safe || "verdict"}`;
}

export function buildShareSummary(result: VerificationResult): string {
  const lines = [
    `ActionProof verdict: ${result.status}`,
    `Verification ID: ${result.verificationId}`,
    `Contract: ${result.contract.contractId} rev ${result.contract.revision} (hash ${result.contract.hash})`,
    `Evidence bundle: ${result.evidence.bundleId ?? "attached bundle"} (hash ${result.evidence.hash})`,
    `Provenance: ${result.evidence.provenance} · chain ${result.evidence.integrity.chain} · bundle ${result.evidence.integrity.bundle}`,
    `Verifier: ${result.verifier.name} v${result.verifier.version} · profile ${result.verifier.profileId} (${result.verifier.profileHash.slice(0, 16)}…)`,
    `Assertions: ${result.summary.passed} passed, ${result.summary.failed} drifted, ${result.summary.blocked} blocked, ${result.summary.unsafe} unsafe, ${result.summary.inconclusive} not evaluable`,
    `Issued: ${result.createdAt}`,
  ];
  return lines.join("\n");
}

export function buildHtmlReceipt(result: VerificationResult): string {
  const escaped = escapeHtml;
  const rows = result.assertionResults
    .map(
      (assertion) => `<tr>
  <td><code>${escaped(assertion.assertionId)}</code></td>
  <td>${escaped(assertion.description ?? "")}</td>
  <td class="status status-${escaped(assertion.status)}">${escaped(assertion.status)}</td>
  <td><code>${escaped(assertion.reasonCode)}</code></td>
  <td><code>${escaped(assertion.evidenceEventIds.join(", ")) || "—"}</code></td>
</tr>`,
    )
    .join("\n");

  const reasonCodes = result.reasonCodes.length > 0 ? result.reasonCodes.map((code) => `<li><code>${escaped(code)}</code></li>`).join("\n") : "<li><code>none</code></li>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ActionProof receipt ${escaped(result.verificationId)} — ${escaped(result.status)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; padding: 2rem; background: #f6f7f9; color: #1f2328; }
  main { max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid #d1d9e0; padding: 2rem; }
  h1 { font-size: 1.4rem; margin: 0 0 0.3rem; }
  .badge { display: inline-block; padding: 0.2rem 0.7rem; border: 1px solid currentColor; font-weight: 600; letter-spacing: 0.05em; }
  .status-PASS { color: #1a7f37; } .status-DRIFT { color: #9a6700; }
  .status-UNSAFE_BYPASS { color: #cf222e; } .status-BLOCKED { color: #0969da; } .status-INCONCLUSIVE { color: #57606a; }
  td.status-PASS { color: #1a7f37; } td.status-DRIFT, td.status-not-evaluable { color: #9a6700; }
  td.status-UNSAFE_BYPASS, td.status-unsafe { color: #cf222e; } td.status-BLOCKED, td.status-blocked { color: #0969da; } td.status-failed { color: #9a6700; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.85em; overflow-wrap: anywhere; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th, td { border: 1px solid #d1d9e0; padding: 0.5rem; text-align: left; font-size: 0.85rem; vertical-align: top; }
  th { background: #f6f7f9; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.35rem 1rem; font-size: 0.85rem; }
  dt { color: #57606a; } dd { margin: 0; }
  h2 { font-size: 1rem; border-bottom: 1px solid #d1d9e0; padding-bottom: 0.3rem; margin-top: 1.6rem; }
  .note { background: #f6f7f9; border: 1px solid #d1d9e0; padding: 0.7rem 1rem; font-size: 0.85rem; }
  footer { margin-top: 2rem; color: #57606a; font-size: 0.78rem; }
</style>
</head>
<body>
<main>
  <h1>ActionProof verification receipt</h1>
  <p><span class="badge status-${escaped(result.status)}">${escaped(result.status)}</span></p>
  <dl>
    <dt>Verification ID</dt><dd><code>${escaped(result.verificationId)}</code></dd>
    <dt>Issued</dt><dd><code>${escaped(result.createdAt)}</code></dd>
    <dt>Contract</dt><dd><code>${escaped(result.contract.contractId)} rev ${result.contract.revision}</code><br><code>${escaped(result.contract.hash)}</code></dd>
    <dt>Evidence</dt><dd><code>${escaped(result.evidence.bundleId ?? "attached bundle")}</code><br><code>${escaped(result.evidence.hash)}</code></dd>
    <dt>Coverage</dt><dd>${escaped(result.coverage.mode)}</dd>
    <dt>Provenance</dt><dd>${escaped(result.evidence.provenance)} · chain ${escaped(result.evidence.integrity.chain)} · bundle ${escaped(result.evidence.integrity.bundle)} · signature ${escaped(result.evidence.integrity.signature)}</dd>
    <dt>Verifier</dt><dd><code>${escaped(result.verifier.name)} v${result.verifier.version}</code> · profile <code>${escaped(result.verifier.profileId)}</code> (<code>${escaped(result.verifier.profileHash)}</code>)</dd>
    <dt>Summary</dt><dd>${result.summary.passed} passed · ${result.summary.failed} drifted · ${result.summary.blocked} blocked · ${result.summary.unsafe} unsafe · ${result.summary.inconclusive} not evaluable</dd>
  </dl>

  <h2>Reason codes</h2>
  <ul>${reasonCodes}</ul>

  <h2>Assertion results</h2>
  <table>
    <thead><tr><th>ID</th><th>Description</th><th>Status</th><th>Reason code</th><th>Linked events</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>

  <p class="note">This receipt was computed by the ActionProof deterministic verifier from the submitted contract and evidence bundle. It records what the supplied trace could prove — nothing more. ${result.evidence.provenance === "verified" || result.evidence.provenance === "tamper-evident" ? "The evidence provenance is cryptographically verifiable." : "The evidence producer is not cryptographically verified; treat the verdict as based on structurally valid input only."}</p>

  <h2>Machine-readable receipt</h2>
  <p>The complete result is embedded below and in the companion JSON file.</p>
  <script type="application/json" id="actionproof-receipt">${JSON.stringify(result).replaceAll("<", "\\u003c")}</script>
  <footer>Generated ${escaped(new Date().toISOString())} · ActionProof — contracts express expectations, evidence records observations, the verifier makes the conclusion.</footer>
</main>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
