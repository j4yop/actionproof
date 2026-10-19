"use client";

import { useMemo, useState } from "react";
import { examples, getExample } from "@/domain/actionproof/examples";
import type { VerificationResult } from "@/domain/actionproof/types";

type ApiError = {
  code: string;
  message: string;
  issues?: Array<{ path?: Array<string | number>; message: string }>;
};

const initialExample = getExample("pass");

export function ActionProofConsole() {
  const [contractText, setContractText] = useState(() => pretty(initialExample?.contract));
  const [evidenceText, setEvidenceText] = useState(() => pretty(initialExample?.evidence));
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [activeExample, setActiveExample] = useState("pass");

  const inputStats = useMemo(
    () => ({
      contractLines: lineCount(contractText),
      evidenceLines: lineCount(evidenceText),
      evidenceBytes: new TextEncoder().encode(evidenceText).byteLength,
    }),
    [contractText, evidenceText],
  );

  async function verifyInput() {
    setError(null);
    setResult(null);
    setIsVerifying(true);

    let contract: unknown;
    let evidence: unknown;
    try {
      contract = JSON.parse(contractText);
      evidence = JSON.parse(evidenceText);
    } catch {
      setError({ code: "INVALID_JSON", message: "Both editors must contain valid JSON before verification can run." });
      setIsVerifying(false);
      return;
    }

    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contract, evidence }),
      });
      const body = (await response.json()) as { result?: VerificationResult; error?: ApiError };
      if (!response.ok || !body.result) {
        setError(body.error ?? { code: "UNKNOWN_ERROR", message: "The verifier did not return a result." });
        return;
      }
      setResult(body.result);
    } catch {
      setError({ code: "NETWORK_ERROR", message: "The verification request could not reach the live API." });
    } finally {
      setIsVerifying(false);
    }
  }

  function loadExample(name: string) {
    const example = getExample(name);
    if (!example) return;
    setActiveExample(name);
    setContractText(pretty(example.contract));
    setEvidenceText(pretty(example.evidence));
    setResult(null);
    setError(null);
  }

  return (
    <main className="app-shell">
      <header className="top-rail">
        <a className="brand" href="#top" aria-label="ActionProof home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>
            <strong>ActionProof</strong>
            <small>evidence verifier</small>
          </span>
        </a>
        <div className="rail-meta" aria-label="Runtime guarantees">
          <span className="live-dot" />
          <span>LIVE CONSOLE</span>
          <span className="rail-divider" />
          <span>DETERMINISTIC</span>
          <span className="rail-divider" />
          <span>NO LLM</span>
        </div>
        <a className="source-link" href="https://github.com/j4yop/actionproof" target="_blank" rel="noreferrer">
          SOURCE <ArrowUpRight />
        </a>
      </header>

      <section className="intro" id="top">
        <div className="intro-copy">
          <p className="eyebrow">BROWSER-AGENT TRUST BOUNDARY / V1</p>
          <h1>Prove the action.<br /><em>Not the claim.</em></h1>
          <p className="lede">
            ActionProof checks a workflow contract against structured run evidence. It refuses to turn missing proof, UI drift, or an unsafe bypass into a green light.
          </p>
        </div>
        <div className="intro-notes" aria-label="What ActionProof answers">
          <div className="note-line"><span>01</span><p>Did the intended action happen?</p></div>
          <div className="note-line"><span>02</span><p>Did the observed state match?</p></div>
          <div className="note-line"><span>03</span><p>Is the evidence complete enough?</p></div>
        </div>
      </section>

      <section className="workspace" aria-label="ActionProof verification workspace">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">VERIFICATION WORKBENCH</p>
            <h2>Bring your evidence.</h2>
          </div>
          <div className="fixture-strip">
            <span className="fixture-label">TRY A FIXTURE</span>
            {Object.entries(examples).map(([name, example]) => (
              <button key={name} className={`fixture-button ${activeExample === name ? "is-active" : ""}`} onClick={() => loadExample(name)} type="button">
                <span className={`fixture-dot fixture-${name}`} />
                {example.label}
              </button>
            ))}
          </div>
        </div>

        <div className="workspace-grid">
          <section className="input-column" aria-label="Verification inputs">
            <JsonEditor
              label="01 / CONTRACT"
              description="Expected behavior, allowed capabilities, and assertions."
              value={contractText}
              onChange={setContractText}
              lineCount={inputStats.contractLines}
            />
            <JsonEditor
              label="02 / EVIDENCE BUNDLE"
              description="Observed events, coverage, provenance, and integrity metadata."
              value={evidenceText}
              onChange={setEvidenceText}
              lineCount={inputStats.evidenceLines}
            />
            <div className="input-actions">
              <button className="primary-button" onClick={verifyInput} type="button" disabled={isVerifying}>
                <span>{isVerifying ? "Evaluating evidence" : "Verify evidence"}</span>
                <span className="button-arrow" aria-hidden="true"><ArrowUpRight /></span>
              </button>
              <span className="input-footnote">POST /api/verify · {formatBytes(inputStats.evidenceBytes)} evidence payload</span>
            </div>
          </section>

          <ResultPanel result={result} error={error} isVerifying={isVerifying} />
        </div>
      </section>

      <footer className="site-footer">
        <div>
          <span className="footer-kicker">THE TRUST MODEL</span>
          <p>Contracts express expectations. Evidence records observations. The verifier makes the conclusion.</p>
        </div>
        <div className="footer-right">
          <span>ActionProof verifier 1.0.0</span>
          <span>Built for explainable automation</span>
        </div>
      </footer>
    </main>
  );
}

function JsonEditor({ label, description, value, onChange, lineCount }: { label: string; description: string; value: string; onChange: (value: string) => void; lineCount: number }) {
  return (
    <label className="json-editor">
      <span className="editor-header">
        <span>
          <span className="editor-label">{label}</span>
          <span className="editor-description">{description}</span>
        </span>
        <span className="editor-count">{lineCount} lines</span>
      </span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} aria-label={label} />
    </label>
  );
}

function ResultPanel({ result, error, isVerifying }: { result: VerificationResult | null; error: ApiError | null; isVerifying: boolean }) {
  if (isVerifying) {
    return <section className="result-panel result-loading" aria-live="polite"><span className="loading-orbit" /><p>Replaying the contract against the submitted trace.</p><small>No browser opened. No model called.</small></section>;
  }

  if (error) {
    return (
      <section className="result-panel result-error" aria-live="assertive">
        <div className="result-topline"><span className="result-status status-error">INPUT ERROR</span><span className="result-code">{error.code}</span></div>
        <h3>We could not make a conclusion.</h3>
        <p>{error.message}</p>
        {error.issues && error.issues.length > 0 && (
          <ul className="issue-list">
            {error.issues.slice(0, 8).map((issue, index) => <li key={`${issue.message}-${index}`}><span>!</span>{issue.path?.join(".") || "payload"}: {issue.message}</li>)}
          </ul>
        )}
      </section>
    );
  }

  if (!result) {
    return (
      <section className="result-panel result-empty" aria-live="polite">
        <div className="empty-crosshair" aria-hidden="true"><span /><span /></div>
        <div>
          <span className="result-status status-idle">AWAITING EVIDENCE</span>
          <h3>A verdict will appear here.</h3>
          <p>Run the supplied fixture or paste your own contract and evidence. Results are calculated on the server from your input.</p>
        </div>
        <div className="empty-rule" />
        <div className="empty-facts"><span>5 verdict states</span><span>0 model calls</span><span>1 evidence trail</span></div>
      </section>
    );
  }

  const tone = statusTone(result.status);
  return (
    <section className={`result-panel result-${tone}`} aria-live="polite">
      <div className="result-topline"><span className={`result-status status-${tone}`}>{result.status.replace("_", " ")}</span><span className="result-code">{result.verificationId.slice(0, 8)}</span></div>
      <h3>{statusTitle(result.status)}</h3>
      <p>{statusDescription(result.status)}</p>

      <div className="summary-grid" aria-label="Assertion summary">
        <SummaryCell value={result.summary.passed} label="passed" tone="pass" />
        <SummaryCell value={result.summary.failed} label="drift" tone="drift" />
        <SummaryCell value={result.summary.unsafeEvents} label="unsafe events" tone="unsafe" />
        <SummaryCell value={result.summary.inconclusive} label="unknown" tone="unknown" />
      </div>

      <div className="result-section">
        <div className="section-heading"><span>ASSERTION TRACE</span><small>{result.assertionResults.length} checks</small></div>
        <div className="assertion-list">
          {result.assertionResults.map((assertion) => (
            <div className="assertion-row" key={assertion.assertionId}>
              <span className={`assertion-marker marker-${assertion.status}`} aria-hidden="true" />
              <div className="assertion-main"><strong>{assertion.description || assertion.assertionId}</strong><span>{assertion.reasonCode.replaceAll("_", " ")}</span></div>
              <div className="assertion-evidence">{assertion.evidenceEventIds.length > 0 ? assertion.evidenceEventIds.join(" · ") : "no linked event"}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="result-section result-details">
        <div className="detail-row"><span>Coverage</span><strong>{result.coverage.mode.toUpperCase()}</strong></div>
        <div className="detail-row"><span>Provenance</span><strong>{result.evidence.provenance.toUpperCase()}</strong></div>
        <div className="detail-row"><span>Chain</span><strong>{result.evidence.integrity.chain.toUpperCase()}</strong></div>
        <div className="detail-row"><span>Bundle hash</span><strong>{result.evidence.integrity.bundle.toUpperCase()}</strong></div>
        <div className="detail-row"><span>Contract</span><code>{result.contract.hash.slice(0, 14)}…</code></div>
        <div className="detail-row"><span>Evidence</span><code>{result.evidence.hash.slice(0, 14)}…</code></div>
      </div>

      <details className="raw-result">
        <summary>Open machine-readable receipt <span><ChevronDown /></span></summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </section>
  );
}

function SummaryCell({ value, label, tone }: { value: number; label: string; tone: string }) {
  return <div className={`summary-cell summary-${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

function statusTone(status: VerificationResult["status"]): string {
  if (status === "PASS") return "pass";
  if (status === "DRIFT") return "drift";
  if (status === "UNSAFE_BYPASS") return "unsafe";
  if (status === "BLOCKED") return "blocked";
  return "unknown";
}

function statusTitle(status: VerificationResult["status"]): string {
  if (status === "PASS") return "The evidence supports the contract.";
  if (status === "DRIFT") return "The run drifted from its contract.";
  if (status === "UNSAFE_BYPASS") return "A forbidden path was observed.";
  if (status === "BLOCKED") return "A policy gate stopped the run.";
  return "The evidence is not sufficient for a verdict.";
}

function statusDescription(status: VerificationResult["status"]): string {
  if (status === "PASS") return "Every required assertion was observable, ordered, and free of a declared unsafe capability.";
  if (status === "DRIFT") return "The bundle was complete, but one or more required observations did not match the declared expectation.";
  if (status === "UNSAFE_BYPASS") return "ActionProof found a forbidden capability or bypass event. A successful-looking final state cannot override it.";
  if (status === "BLOCKED") return "The trace contains an explicit policy denial. Blocked is different from failed and different from missing evidence.";
  return "A missing or partial trace cannot prove that the action did or did not happen. The verifier fails closed.";
}

function pretty(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function lineCount(value: string): number {
  return value.split("\n").length;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function ArrowUpRight() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="arrow-icon"><path d="M3 13 13 3M6 3h7v7" /></svg>;
}

function ChevronDown() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="arrow-icon"><path d="m3 6 5 5 5-5" /></svg>;
}
