"use client";

import { useState } from "react";
import { buildHtmlReceipt, buildShareSummary, receiptFileStem } from "@/domain/actionproof/receipt";
import type { VerificationResult } from "@/domain/actionproof/types";

function download(filename: string, content: string, mediaType: string) {
  const blob = new Blob([content], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ReceiptActions({ result, contractText, evidenceText }: { result: VerificationResult; contractText: string; evidenceText: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(label: string, value: string) {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied((current) => (current === label ? null : current)), 1200);
    } catch {
      setCopied(null);
    }
  }

  const stem = receiptFileStem(result);
  const safeContractId = sanitizeFilename(result.contract.contractId);
  const safeBundleId = sanitizeFilename(result.evidence.bundleId ?? "bundle");

  return (
    <div className="result-section receipt-actions" aria-label="Portable verification receipt">
      <div className="section-heading"><span>PORTABLE RECEIPT</span><small>useful after this tab closes</small></div>
      <div className="receipt-grid">
        <button className="receipt-button" type="button" onClick={() => download(`${stem}.json`, JSON.stringify(result, null, 2), "application/json")}>
          <strong>Download receipt JSON</strong>
          <small>The complete machine-readable verdict.</small>
        </button>
        <button className="receipt-button" type="button" onClick={() => download(`${stem}.html`, buildHtmlReceipt(result), "text/html")}>
          <strong>Download HTML receipt</strong>
          <small>Human-readable, self-contained file.</small>
        </button>
        <button className="receipt-button" type="button" onClick={() => download(`actionproof-contract-${safeContractId}.json`, contractText, "application/json")}>
          <strong>Download contract</strong>
          <small>The expectation this verdict is bound to.</small>
        </button>
        <button className="receipt-button" type="button" onClick={() => download(`actionproof-evidence-${safeBundleId}.json`, evidenceText, "application/json")}>
          <strong>Download evidence bundle</strong>
          <small>The observations behind the verdict.</small>
        </button>
        <button className="receipt-button" type="button" onClick={() => void copy("profile", `${result.verifier.profileId} @ v${result.verifier.version}`)}>
          <strong>{copied === "profile" ? "Copied profile" : "Copy verifier profile"}</strong>
          <small><code>{result.verifier.profileId} @ v{result.verifier.version}</code></small>
        </button>
        <button className="receipt-button" type="button" onClick={() => void copy("summary", buildShareSummary(result))}>
          <strong>{copied === "summary" ? "Copied summary" : "Copy share summary"}</strong>
          <small>Status, hashes, and profile in plain text.</small>
        </button>
      </div>
      <p className="receipt-note">
        Verification ID and contract/evidence hashes are copyable throughout this report. The receipt records what the supplied trace could prove — keep it next to the contract and evidence bundle it refers to.
      </p>
    </div>
  );
}

function sanitizeFilename(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9._-]+/g, "-").replaceAll(/^-+|-+$/g, "") || "artifact";
}
