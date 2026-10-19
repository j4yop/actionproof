import type { AssertionResult, VerificationResult } from "./types";

/**
 * Judge mode: a short, deterministic demo path.
 *
 * Why: browser agents can claim success without proving the action.
 * How: contract → evidence → deterministic verifier.
 * What: PASS → unsafe bypass → INCONCLUSIVE, each linked to decisive evidence.
 *
 * Every step runs the real examples through the live verifier path. Nothing
 * is precomputed and nothing is fabricated — the demo only chooses inputs.
 */

export type JudgeStepKey = "pass" | "unsafe" | "inconclusive";

export interface JudgeStep {
  key: JudgeStepKey;
  exampleKey: string;
  title: string;
  claim: string;
}

export const JUDGE_STEPS: JudgeStep[] = [
  {
    key: "pass",
    exampleKey: "pass",
    title: "A real pass",
    claim: "The trace proves every required action happened, in order, inside scope.",
  },
  {
    key: "unsafe",
    exampleKey: "unsafe",
    title: "A convincing failure",
    claim: "A successful-looking run is still rejected — a forbidden capability voids the outcome.",
  },
  {
    key: "inconclusive",
    exampleKey: "inconclusive",
    title: "An honest unknown",
    claim: "A partial capture cannot prove the action happened. The verifier fails closed instead of guessing.",
  },
];

const STATUS_PRIORITY: Array<AssertionResult["status"]> = ["unsafe", "blocked", "failed", "not-evaluable"];

/** Picks the assertion that decided the verdict: unsafe first, then blocked, failed, not-evaluable. */
export function decisiveAssertion(result: VerificationResult): AssertionResult | undefined {
  for (const status of STATUS_PRIORITY) {
    const match = result.assertionResults.find((assertion) => assertion.status === status);
    if (match) return match;
  }
  return undefined;
}
