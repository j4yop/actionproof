"use client";

import { useState } from "react";
import { getExample } from "@/domain/actionproof/examples";
import { decisiveAssertion, JUDGE_STEPS, type JudgeStepKey } from "@/domain/actionproof/judge";
import type { VerificationResult } from "@/domain/actionproof/types";

type StepState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; result: VerificationResult }
  | { phase: "error"; message: string };

const INITIAL_STEPS: Record<JudgeStepKey, StepState> = {
  pass: { phase: "idle" },
  unsafe: { phase: "idle" },
  inconclusive: { phase: "idle" },
};

export function JudgeMode() {
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const [isRunningSequence, setIsRunningSequence] = useState(false);

  async function runStep(stepKey: JudgeStepKey): Promise<VerificationResult | null> {
    const step = JUDGE_STEPS.find((entry) => entry.key === stepKey);
    const example = getExample(step?.exampleKey ?? "");
    if (!step || !example) return null;

    setSteps((current) => ({ ...current, [stepKey]: { phase: "running" } }));
    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contract: example.contract, evidence: example.evidence }),
      });
      const body = (await response.json()) as { result?: VerificationResult; error?: { message?: string } };
      if (!response.ok || !body.result) {
        setSteps((current) => ({ ...current, [stepKey]: { phase: "error", message: body.error?.message ?? "The verifier did not return a result." } }));
        return null;
      }
      setSteps((current) => ({ ...current, [stepKey]: { phase: "done", result: body.result! } }));
      return body.result;
    } catch {
      setSteps((current) => ({ ...current, [stepKey]: { phase: "error", message: "The verification request could not reach the live API." } }));
      return null;
    }
  }

  async function runSequence() {
    if (isRunningSequence) return;
    setIsRunningSequence(true);
    setSteps(INITIAL_STEPS);
    for (const step of JUDGE_STEPS) {
      const result = await runStep(step.key);
      if (!result) break;
    }
    setIsRunningSequence(false);
  }

  const anyRun = Object.values(steps).some((state) => state.phase !== "idle");

  return (
    <section className="judge-mode" id="judge-mode" aria-label="Judge mode demo">
      <div className="judge-heading">
        <div>
          <span className="judge-kicker">JUDGE MODE</span>
          <h2>See it decide. Three times.</h2>
          <p className="judge-lede">
            Browser agents can claim success without proving the action. ActionProof separates the expectation (contract), the observation (evidence), and the conclusion (a deterministic verifier). This demo runs the real verifier — nothing is precomputed.
          </p>
        </div>
        <div className="judge-actions">
          <button className="primary-button" type="button" onClick={runSequence} disabled={isRunningSequence}>
            <span>{isRunningSequence ? "Running the demo" : "Run the demo"}</span>
            <span className="button-arrow" aria-hidden="true"><ArrowUpRight /></span>
          </button>
          {anyRun && !isRunningSequence && (
            <button className="text-button" type="button" onClick={() => setSteps(INITIAL_STEPS)}>Reset</button>
          )}
        </div>
      </div>

      <ol className="judge-steps">
        {JUDGE_STEPS.map((step, index) => {
          const state = steps[step.key];
          const example = getExample(step.exampleKey);
          return (
            <li key={step.key} className={`judge-step ${state.phase === "done" ? `is-done tone-${verdictTone(state.result.status)}` : ""}`}>
              <div className="judge-step-head">
                <span className="judge-step-index">{index + 1}</span>
                <div className="judge-step-copy">
                  <strong>{step.title}</strong>
                  <span>{step.claim}</span>
                </div>
                <button
                  className="judge-run-button"
                  type="button"
                  onClick={() => void runStep(step.key)}
                  disabled={state.phase === "running" || isRunningSequence}
                >
                  {state.phase === "running" ? "Verifying…" : state.phase === "done" ? "Run again" : "Run step"}
                </button>
              </div>
              {state.phase === "done" && (
                <div className="judge-step-verdict" aria-live="polite">
                  <div className="judge-verdict-line">
                    <span className={`result-status status-${verdictTone(state.result.status)}`}>{state.result.status.replace("_", " ")}</span>
                    <span className="judge-verdict-note">{verdictNote(state.result.status)}</span>
                  </div>
                  <DecisiveEvidence result={state.result} evidenceEvents={example?.evidence.events ?? []} />
                </div>
              )}
              {state.phase === "error" && <p className="judge-error" role="alert">{state.message}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DecisiveEvidence({ result, evidenceEvents }: { result: VerificationResult; evidenceEvents: Array<{ eventId: string; type: string; sequence: number; occurredAt: string; payload: Record<string, unknown> }> }) {
  const assertion = decisiveAssertion(result);
  if (!assertion) {
    return <p className="judge-decisive"><span>Decisive evidence</span><code>Every required assertion passed on its own linked events.</code></p>;
  }
  const linked = assertion.evidenceEventIds.map((eventId) => evidenceEvents.find((event) => event.eventId === eventId)).filter((event) => event !== undefined);
  return (
    <div className="judge-decisive">
      <span>Decisive evidence</span>
      <code>
        <strong>{assertion.description || assertion.assertionId}</strong> · {assertion.reasonCode.replaceAll("_", " ")}
        {linked.map((event) => (
          <span key={event.eventId} className="judge-event">
            {event.eventId} · {event.type} · seq {event.sequence} · {formatValue(event.payload)}
          </span>
        ))}
      </code>
    </div>
  );
}

function verdictTone(status: VerificationResult["status"]): string {
  if (status === "PASS") return "pass";
  if (status === "UNSAFE_BYPASS") return "unsafe";
  if (status === "BLOCKED") return "blocked";
  if (status === "DRIFT") return "drift";
  return "unknown";
}

function verdictNote(status: VerificationResult["status"]): string {
  if (status === "PASS") return "Proven by the evidence, not by the claim.";
  if (status === "UNSAFE_BYPASS") return "The forbidden event is linked below.";
  if (status === "BLOCKED") return "An explicit gate denial, not a silent failure.";
  if (status === "DRIFT") return "The observation contradicted the expectation.";
  return "Missing evidence fails closed.";
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function ArrowUpRight() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="arrow-icon"><path d="M3 13 13 3M6 3h7v7" /></svg>;
}
