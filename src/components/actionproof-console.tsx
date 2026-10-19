"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { examples, getExample } from "@/domain/actionproof/examples";
import { ContractWizard } from "@/components/contract-wizard";
import type { EvidenceBundle, VerificationResult } from "@/domain/actionproof/types";

type ApiError = {
  code: string;
  message: string;
  issues?: Array<{ path?: Array<string | number>; message: string }>;
  field?: "contract" | "evidence";
};

const initialExample = getExample("pass");

export function ActionProofConsole() {
  const [contractText, setContractText] = useState(() => pretty(initialExample?.contract));
  const [evidenceText, setEvidenceText] = useState(() => pretty(initialExample?.evidence));
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [activeExample, setActiveExample] = useState("pass");
  const [verifiedInput, setVerifiedInput] = useState<{ contract: string; evidence: string } | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [inputMode, setInputMode] = useState<"guided" | "expert">("guided");
  const workbenchRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  const resultIsStale = Boolean(result && verifiedInput && (verifiedInput.contract !== contractText || verifiedInput.evidence !== evidenceText));

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
    setIsVerifying(true);

    let contract: unknown;
    let evidence: unknown;
    let contractError: ApiError | null = null;
    let evidenceError: ApiError | null = null;
    try {
      contract = JSON.parse(contractText);
    } catch {
      contractError = { code: "INVALID_JSON", message: "The contract editor contains invalid JSON.", field: "contract" };
    }
    try {
      evidence = JSON.parse(evidenceText);
    } catch {
      evidenceError = { code: "INVALID_JSON", message: "The evidence editor contains invalid JSON.", field: "evidence" };
    }
    if (contractError || evidenceError) {
      setError(contractError ?? evidenceError);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" }));
      setIsVerifying(false);
      return;
    }

    await submitVerification(contract, evidence, { contract: contractText, evidence: evidenceText });
  }

  async function submitVerification(contract: unknown, evidence: unknown, inputSnapshot: { contract: string; evidence: string }) {
    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contract, evidence }),
      });
      const body = (await response.json()) as { result?: VerificationResult; error?: ApiError };
      if (!response.ok || !body.result) {
        const apiError = body.error ?? { code: "UNKNOWN_ERROR", message: "The verifier did not return a result." };
        const field = apiError.issues?.[0]?.path?.[0];
        setError({ ...apiError, field: field === "contract" || field === "evidence" ? field : undefined });
        requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" }));
        return;
      }
      setResult(body.result);
      setVerifiedInput(inputSnapshot);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" }));
    } catch {
      setError({ code: "NETWORK_ERROR", message: "The verification request could not reach the live API." });
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" }));
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
    setVerifiedInput(null);
    setError(null);
  }

  function runExample(name: string) {
    const example = getExample(name);
    if (!example || isVerifying) return;
    const nextContract = pretty(example.contract);
    const nextEvidence = pretty(example.evidence);
    setActiveExample(name);
    setContractText(nextContract);
    setEvidenceText(nextEvidence);
    setError(null);
    setIsVerifying(true);
    void submitVerification(example.contract, example.evidence, { contract: nextContract, evidence: nextEvidence });
  }

  function updateEditor(kind: "contract" | "evidence", value: string) {
    setActiveExample("custom");
    if (kind === "contract") setContractText(value);
    else setEvidenceText(value);
    if (result) setError({ code: "INPUT_CHANGED", message: "Inputs changed after the last verification. Run verification again before treating the result as current." });
  }

  function loadContractFromWizard(contractJson: string) {
    setContractText(contractJson);
    setActiveExample("custom");
    setResult(null);
    setVerifiedInput(null);
    setError(null);
    setInputMode("expert");
    scrollToWorkbench();
  }

  function scrollToWorkbench() {
    workbenchRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
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
          <h1>Prove the action.<br className="headline-break" /> <em>Not the claim.</em></h1>
          <p className="lede">
            A deterministic evidence check for browser-agent runs. Submit the expectation, submit the trace, and see exactly what the trace can prove.
          </p>
          <div className="intro-actions">
            <button className="primary-button intro-button" onClick={() => { runExample("pass"); scrollToWorkbench(); }} type="button" disabled={isVerifying}>
              <span>Run verified fixture</span>
              <span className="button-arrow" aria-hidden="true"><ArrowUpRight /></span>
            </button>
            <button className="text-button" onClick={scrollToWorkbench} type="button">Open workbench <span>↓</span></button>
          </div>
        </div>
        <div className="intro-notes" aria-label="What ActionProof answers">
          <div className="note-line"><p>Contract</p><small>What should happen</small></div>
          <div className="note-line"><p>Evidence</p><small>What was observed</small></div>
          <div className="note-line"><p>Verdict</p><small>What the trace proves</small></div>
        </div>
      </section>

      <section className="workspace" aria-label="ActionProof verification workspace" ref={workbenchRef}>
        <div className="workspace-heading">
          <div>
            <h2>Bring your evidence.</h2>
            <p className="workspace-subtitle">Load a verified path or an adversarial scenario. Every scenario runs through the live verifier — nothing is trusted until you press verify.</p>
          </div>
          <div className="fixture-strip">
            <span className="fixture-label">VERIFIED PATH</span>
            {Object.entries(examples).filter(([, example]) => example.category === "verified").map(([name, example]) => (
              <button key={name} className={`fixture-button ${activeExample === name ? "is-active" : ""}`} onClick={() => loadExample(name)} type="button" aria-pressed={activeExample === name} disabled={isVerifying} title={example.description}>
                <span className={`fixture-dot fixture-${example.tone}`} />
                {example.label}
              </button>
            ))}
            <span className="fixture-label fixture-label-adversarial">ADVERSARIAL GALLERY</span>
            {Object.entries(examples).filter(([, example]) => example.category === "adversarial").map(([name, example]) => (
              <button key={name} className={`fixture-button ${activeExample === name ? "is-active" : ""}`} onClick={() => loadExample(name)} type="button" aria-pressed={activeExample === name} disabled={isVerifying} title={example.description}>
                <span className={`fixture-dot fixture-${example.tone}`} />
                {example.label}
              </button>
            ))}
            {activeExample === "custom" && <span className="custom-state">CUSTOM INPUT</span>}
          </div>
        </div>

        <div className="workspace-grid">
          <section className="input-column" aria-label="Verification inputs">
            <div className="mode-toggle" role="group" aria-label="Contract input mode">
              <button className={`mode-button ${inputMode === "guided" ? "is-active" : ""}`} onClick={() => setInputMode("guided")} type="button" aria-pressed={inputMode === "guided"} disabled={isVerifying}>Guided setup</button>
              <button className={`mode-button ${inputMode === "expert" ? "is-active" : ""}`} onClick={() => setInputMode("expert")} type="button" aria-pressed={inputMode === "expert"} disabled={isVerifying}>Expert JSON</button>
              <span className="mode-note">{inputMode === "guided" ? "Answers compile into the contract schema." : "Raw contract and evidence, nothing hidden."}</span>
            </div>
            {inputMode === "guided" ? (
              <>
                <ContractWizard disabled={isVerifying} onLoad={loadContractFromWizard} />
                <JsonEditor
                  label="EVIDENCE BUNDLE"
                  description="Observed events, coverage, provenance, and integrity metadata."
                  value={evidenceText}
                  onChange={(value) => updateEditor("evidence", value)}
                  lineCount={inputStats.evidenceLines}
                  disabled={isVerifying}
                  invalid={error?.field === "evidence"}
                  errorMessage={error?.field === "evidence" ? error.message : undefined}
                />
              </>
            ) : (
              <>
                <JsonEditor
                  label="CONTRACT"
                  description="Expected behavior, allowed capabilities, and assertions."
                  value={contractText}
                  onChange={(value) => updateEditor("contract", value)}
                  lineCount={inputStats.contractLines}
                  disabled={isVerifying}
                  invalid={error?.field === "contract"}
                  errorMessage={error?.field === "contract" ? error.message : undefined}
                />
                <JsonEditor
                  label="EVIDENCE BUNDLE"
                  description="Observed events, coverage, provenance, and integrity metadata."
                  value={evidenceText}
                  onChange={(value) => updateEditor("evidence", value)}
                  lineCount={inputStats.evidenceLines}
                  disabled={isVerifying}
                  invalid={error?.field === "evidence"}
                  errorMessage={error?.field === "evidence" ? error.message : undefined}
                />
              </>
            )}
            <div className="input-actions">
              <button className="primary-button" onClick={verifyInput} type="button" disabled={isVerifying}>
                <span>{isVerifying ? "Evaluating evidence" : "Verify evidence"}</span>
                <span className="button-arrow" aria-hidden="true"><ArrowUpRight /></span>
              </button>
              <span className="input-footnote">POST /api/verify · {formatBytes(inputStats.evidenceBytes)} evidence payload · {activeExample === "custom" ? "custom input" : "fixture input"}</span>
            </div>
          </section>

          <ResultPanel result={result} error={error} isVerifying={isVerifying} resultRef={resultRef} stale={resultIsStale} evidenceText={evidenceText} />
        </div>
      </section>

      <footer className="site-footer">
        <div>
          <p>Contracts express expectations. Evidence records observations. The verifier makes the conclusion.</p>
        </div>
        <div className="footer-right">
          <span>ActionProof verifier 1.1.0</span>
          <span>Built for explainable automation</span>
        </div>
      </footer>
    </main>
  );
}

function JsonEditor({ label, description, value, onChange, lineCount, disabled, invalid, errorMessage }: { label: string; description: string; value: string; onChange: (value: string) => void; lineCount: number; disabled: boolean; invalid: boolean; errorMessage?: string }) {
  const editorId = label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  return (
    <label className={`json-editor ${invalid ? "is-invalid" : ""}`}>
      <span className="editor-header">
        <span>
          <span className="editor-label">{label}</span>
          <span className="editor-description">{description}</span>
        </span>
        <span className="editor-count">{lineCount} lines</span>
      </span>
      <textarea id={editorId} value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} aria-label={label} aria-invalid={invalid} aria-describedby={errorMessage ? `${editorId}-error` : undefined} disabled={disabled} />
      {errorMessage && <span className="editor-error" id={`${editorId}-error`}>{errorMessage}</span>}
    </label>
  );
}

function ResultPanel({ result, error, isVerifying, resultRef, stale, evidenceText }: { result: VerificationResult | null; error: ApiError | null; isVerifying: boolean; resultRef: RefObject<HTMLElement | null>; stale: boolean; evidenceText: string }) {
  if (isVerifying) {
    return <section className="result-panel result-loading" ref={resultRef} aria-live="polite"><span className="loading-orbit" /><p>Replaying the contract against the submitted trace.</p><small>No browser opened. No model called.</small></section>;
  }

  if (error && !result) {
    return (
      <section className="result-panel result-error" ref={resultRef} aria-live="assertive">
        <div className="result-topline"><span className="result-status status-error">INPUT ERROR</span><span className="result-code">{error.code}</span></div>
        <h3>We could not make a conclusion.</h3>
        <p>{error.message}</p>
        {error.field && <p className="error-location">Fix the {error.field} editor, then run verification again.</p>}
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
      <section className="result-panel result-empty" ref={resultRef} aria-live="polite">
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
  const displayStale = stale || error?.code === "INPUT_CHANGED";
  const eventMap = getEvidenceEventMap(evidenceText);
  return (
    <>
      {error && <div className="result-error-inline" role="status"><strong>{error.code}</strong><span>{error.message}</span></div>}
    <section className={`result-panel result-${tone}`} ref={resultRef} aria-live="polite">
      <div className="result-topline"><span className={`result-status status-${tone}`}>{result.status.replace("_", " ")}</span><span className="result-code">{result.verificationId.slice(0, 8)} <CopyButton value={result.verificationId} label="Copy verification ID" /></span></div>
      {displayStale && <div className="stale-banner" role="status"><span>RESULT STALE</span> Inputs changed after this verification. Run it again before relying on this verdict.</div>}
      <h3>{statusTitle(result.status)}</h3>
      <p>{statusDescription(result.status)}</p>
      {result.evidence.provenance === "unverified" && <div className="trust-note"><span className="trust-mark">!</span><span>This verdict is based on structurally valid evidence. Its producer is not cryptographically verified.</span></div>}

      <div className="summary-grid" aria-label="Assertion summary">
        <SummaryCell value={result.summary.passed} label="passed" tone="pass" />
        <SummaryCell value={result.summary.failed} label="drift" tone="drift" />
        <SummaryCell value={result.summary.blocked} label="blocked" tone="blocked" />
        <SummaryCell value={result.summary.unsafeEvents} label="unsafe events" tone="unsafe" />
        <SummaryCell value={result.summary.inconclusive} label="unknown" tone="unknown" />
      </div>

      <div className="result-section">
        <div className="section-heading"><span>ASSERTION TRACE</span><small>{result.assertionResults.length} checks</small></div>
        <div className="assertion-list">
          {result.assertionResults.map((assertion) => (
            <details className="assertion-row" key={assertion.assertionId}>
              <summary>
                <span className={`assertion-marker marker-${assertion.status}`} aria-hidden="true" />
                <div className="assertion-main"><strong>{assertion.description || assertion.assertionId}</strong><span>{assertionStatusLabel(assertion.status)} · {assertion.reasonCode.replaceAll("_", " ")}</span></div>
                <div className="assertion-evidence">{assertion.evidenceEventIds.length > 0 ? assertion.evidenceEventIds.join(" · ") : "no linked event"}<ChevronDown /></div>
              </summary>
              <div className="assertion-detail">
                <div><span>Expected</span><code>{formatValue(assertion.expected)}</code></div>
                <div><span>Observed</span><code>{formatValue(assertion.observed)}</code></div>
                <div><span>Linked events</span><code>{assertion.evidenceEventIds.length ? assertion.evidenceEventIds.join(", ") : "none"}</code></div>
                {assertion.evidenceEventIds.length > 0 && <div className="event-excerpts"><span>Evidence excerpts</span>{assertion.evidenceEventIds.map((eventId) => <EventExcerpt key={eventId} event={eventMap.get(eventId)} fallbackId={eventId} />)}</div>}
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="result-section result-details">
        <div className="detail-row"><span>Coverage</span><strong>{result.coverage.mode.toUpperCase()}</strong></div>
        <div className="detail-row"><span>Provenance</span><strong>{result.evidence.provenance.toUpperCase()}</strong></div>
        <div className="detail-row"><span>Chain</span><strong>{result.evidence.integrity.chain.toUpperCase()}</strong></div>
        <div className="detail-row"><span>Bundle hash</span><strong>{result.evidence.integrity.bundle.toUpperCase()}</strong></div>
        <div className="detail-row"><span>Contract</span><code>{result.contract.hash.slice(0, 14)}… <CopyButton value={result.contract.hash} label="Copy contract hash" /></code></div>
        <div className="detail-row"><span>Evidence</span><code>{result.evidence.hash.slice(0, 14)}… <CopyButton value={result.evidence.hash} label="Copy evidence hash" /></code></div>
      </div>

      <details className="raw-result">
        <summary>Open machine-readable receipt <span><ChevronDown /></span></summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </section>
    </>
  );
}

function SummaryCell({ value, label, tone }: { value: number; label: string; tone: string }) {
  return <div className={`summary-cell summary-${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`copy-button ${copied ? "is-copied" : ""}`}
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          if (!navigator.clipboard) throw new Error("Clipboard unavailable");
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "COPIED" : "COPY"}
    </button>
  );
}

function assertionStatusLabel(status: VerificationResult["assertionResults"][number]["status"]): string {
  if (status === "passed") return "Passed";
  if (status === "failed") return "Drifted";
  if (status === "blocked") return "Blocked";
  if (status === "unsafe") return "Unsafe";
  return "Not evaluable";
}

function formatValue(value: unknown): string {
  if (value === undefined) return "not provided";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function getEvidenceEventMap(value: string): Map<string, EvidenceBundle["events"][number]> {
  try {
    const parsed = JSON.parse(value) as EvidenceBundle;
    return new Map((parsed.events ?? []).map((event) => [event.eventId, event]));
  } catch {
    return new Map();
  }
}

function EventExcerpt({ event, fallbackId }: { event?: EvidenceBundle["events"][number]; fallbackId: string }) {
  if (!event) return <code className="event-excerpt">{fallbackId} · event not found in current evidence</code>;
  return <code className="event-excerpt"><strong>{event.eventId}</strong> · {event.type} · seq {event.sequence} · {event.occurredAt}<br />{formatValue(event.payload)}</code>;
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
