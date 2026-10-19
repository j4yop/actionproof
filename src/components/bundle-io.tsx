"use client";

import { useState } from "react";
import { buildBundleZip, readBundleArchive, type BundleManifest } from "@/domain/actionproof/bundle";
import type { VerificationResult } from "@/domain/actionproof/types";

type BundleMessage =
  | { tone: "error"; lines: string[] }
  | { tone: "success"; lines: string[] };

export function BundleIO({
  result,
  contractText,
  evidenceText,
  onImport,
}: {
  result: VerificationResult | null;
  contractText: string;
  evidenceText: string;
  onImport: (contractJson: string, evidenceJson: string, manifest: BundleManifest) => void;
}) {
  const [message, setMessage] = useState<BundleMessage | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  async function exportBundle() {
    setIsWorking(true);
    setMessage(null);
    try {
      const contract = JSON.parse(contractText) as unknown;
      const evidence = JSON.parse(evidenceText) as unknown;
      const bytes = await buildBundleZip({
        contract,
        evidence: evidence as Parameters<typeof buildBundleZip>[0]["evidence"],
        receipt: result,
        createdAt: new Date().toISOString(),
      });
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "actionproof-bundle.zip";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage({ tone: "success", lines: ["Bundle exported: manifest, contract, evidence" + (result ? ", receipt" : "") + "."] });
    } catch {
      setMessage({ tone: "error", lines: ["The bundle could not be exported. The contract or evidence editor contains invalid JSON."] });
    } finally {
      setIsWorking(false);
    }
  }

  async function importBundle(file: File) {
    setIsWorking(true);
    setMessage(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const validation = await readBundleArchive(bytes);
      if (!validation.ok || !validation.contents) {
        setMessage({ tone: "error", lines: ["This bundle was not imported. ActionProof does not repair or guess:"].concat(validation.issues) });
        return;
      }
      const { contract, evidence, manifest } = validation.contents;
      onImport(JSON.stringify(contract, null, 2), JSON.stringify(evidence, null, 2), manifest);
      setMessage({
        tone: "success",
        lines: [
          `Imported bundle ${manifest.contract.contractId} rev ${manifest.contract.revision} (${manifest.evidence.bundleId}).`,
          "Hashes matched the manifest. Verify it to get a verdict.",
        ],
      });
    } catch {
      setMessage({ tone: "error", lines: ["The bundle could not be read."] });
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="result-section bundle-io" aria-label="Evidence bundle">
      <div className="section-heading"><span>EVIDENCE BUNDLE</span><small>versioned, hash-declared archive</small></div>
      <div className="bundle-actions">
        <button className="receipt-button" type="button" onClick={() => void exportBundle()} disabled={isWorking}>
          <strong>Export bundle (.zip)</strong>
          <small>manifest.json + contract + evidence{result ? " + receipt" : ""}.</small>
        </button>
        <label className="receipt-button bundle-import">
          <strong>Import bundle</strong>
          <small>Loads a bundle into the editors. Nothing is verified yet.</small>
          <input
            type="file"
            accept=".zip,application/zip"
            className="bundle-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBundle(file);
              event.target.value = "";
            }}
            disabled={isWorking}
          />
        </label>
      </div>
      {message && (
        <div className={`bundle-message ${message.tone === "error" ? "is-error" : "is-success"}`} role="status">
          {message.lines.map((line, index) => <p key={index}>{line}</p>)}
        </div>
      )}
      <p className="bundle-note">
        A bundle declares its schema version, the SHA-256 of every file it contains, the verifier profile that produced the receipt, and the artifact inventory. Import is strict: a bundle that does not match its manifest is rejected, never repaired.
      </p>
    </div>
  );
}
