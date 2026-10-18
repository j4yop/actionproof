import type {
  AssertionResult,
  Contract,
  ContractAssertion,
  EvidenceBundle,
  EvidenceEvent,
  EventSelector,
  Predicate,
  VerificationContext,
  VerificationResult,
} from "./types";
import { REASON_CODES } from "./reason-codes";
import { valuesEqual } from "./stable-json";
import { validateDomainInputs } from "./validation";

export function verify(contract: Contract, evidence: EvidenceBundle, context: VerificationContext): VerificationResult {
  const validationIssues = validateDomainInputs(contract, evidence);
  if (validationIssues.length > 0) {
    throw new VerificationInputError(validationIssues);
  }

  const events = [...evidence.events].sort((left, right) => left.sequence - right.sequence);
  const coverageIssues = getCoverageIssues(contract, evidence, events);
  const assertionResults = contract.assertions.map((assertion) => evaluateAssertion(assertion, evidence, events));

  if (coverageIssues.length > 0 && contract.capture.completeness === "required") {
    for (const issue of coverageIssues) {
      assertionResults.push({
        assertionId: `coverage:${issue.code.toLowerCase()}`,
        kind: "event-present",
        required: true,
        status: "not-evaluable",
        reasonCode: issue.code,
        evidenceEventIds: [],
        expected: issue.message,
      });
    }
  }

  const explicitBlock = events.find((event) => isExplicitBlock(event));
  const status = classifyStatus(assertionResults, explicitBlock, evidence);
  const reasonCodes = uniqueStrings([
    ...coverageIssues.map((issue) => issue.code),
    ...assertionResults.map((result) => result.reasonCode),
    ...(explicitBlock ? [REASON_CODES.EXPLICIT_POLICY_BLOCK] : []),
  ]);

  return {
    schema: "actionproof.result/v1",
    verificationId: context.verificationId,
    status,
    contract: {
      contractId: contract.contractId,
      revision: contract.revision,
      hash: context.contractHash,
    },
    evidence: {
      bundleId: evidence.bundleId,
      hash: context.evidenceHash,
      provenance: getProvenanceStatus(evidence),
    },
    verifier: {
      name: "actionproof-verifier",
      version: context.verifierVersion,
      profileId: context.profileId,
      profileHash: context.profileHash,
    },
    summary: summarize(assertionResults),
    assertionResults,
    reasonCodes,
    coverage: evidence.coverage,
    createdAt: context.createdAt,
  };
}

export class VerificationInputError extends Error {
  constructor(public readonly issues: ReturnType<typeof validateDomainInputs>) {
    super("The contract and evidence bundle failed domain validation.");
    this.name = "VerificationInputError";
  }
}

function evaluateAssertion(assertion: ContractAssertion, evidence: EvidenceBundle, events: EvidenceEvent[]): AssertionResult {
  switch (assertion.kind) {
    case "event-present": {
      const matches = findMatches(assertion.selector, events);
      const min = assertion.min ?? 1;
      const max = assertion.max ?? Number.POSITIVE_INFINITY;
      const passed = matches.length >= min && matches.length <= max;
      return resultFor(assertion, passed ? "passed" : getMissingStatus(evidence), passed ? REASON_CODES.ASSERTION_PASSED : REASON_CODES.EVENT_COUNT_OUT_OF_RANGE, matches.map((event) => event.eventId), {
        expected: { min, max: Number.isFinite(max) ? max : "unbounded" },
        observed: { count: matches.length },
      });
    }
    case "event-absent": {
      const matches = findMatches(assertion.selector, events);
      const passed = matches.length === 0 && evidence.coverage.mode === "complete";
      const status = matches.length > 0 ? "failed" : passed ? "passed" : "not-evaluable";
      return resultFor(assertion, status, matches.length > 0 ? REASON_CODES.EVENT_FORBIDDEN : passed ? REASON_CODES.ASSERTION_PASSED : REASON_CODES.COVERAGE_INCOMPLETE, matches.map((event) => event.eventId), {
        expected: "no matching event",
        observed: { count: matches.length },
      });
    }
    case "event-order": {
      const before = findMatches(assertion.before, events);
      const after = findMatches(assertion.after, events);
      const beforeEvent = before[0];
      const afterEvent = after.find((event) => beforeEvent && event.sequence > beforeEvent.sequence);
      if (beforeEvent && afterEvent) {
        return resultFor(assertion, "passed", REASON_CODES.ASSERTION_PASSED, [beforeEvent.eventId, afterEvent.eventId], {
          expected: "before → after",
          observed: `${beforeEvent.type} → ${afterEvent.type}`,
        });
      }
      const partial = evidence.coverage.mode !== "complete";
      return resultFor(assertion, partial ? "not-evaluable" : "failed", partial ? REASON_CODES.EVENT_ORDER_NOT_OBSERVABLE : REASON_CODES.EVENT_ORDER_WRONG, [beforeEvent?.eventId, after?.[0]?.eventId].filter(Boolean) as string[], {
        expected: "before → after",
        observed: { before: before.length, after: after.length },
      });
    }
    case "duration": {
      const start = findMatches(assertion.start, events)[0];
      const end = findMatches(assertion.end, events).find((event) => start && event.sequence >= start.sequence);
      if (!start || !end) {
        return resultFor(assertion, evidence.coverage.mode === "complete" ? "failed" : "not-evaluable", evidence.coverage.mode === "complete" ? REASON_CODES.DURATION_NOT_OBSERVABLE : REASON_CODES.COVERAGE_INCOMPLETE, [start?.eventId, end?.eventId].filter(Boolean) as string[], {
          expected: { minMs: assertion.minMs ?? 0, maxMs: assertion.maxMs ?? "unbounded" },
          observed: "duration unavailable",
        });
      }
      const durationMs = Date.parse(end.occurredAt) - Date.parse(start.occurredAt);
      const passed = durationMs >= (assertion.minMs ?? 0) && (assertion.maxMs === undefined || durationMs <= assertion.maxMs);
      return resultFor(assertion, passed ? "passed" : "failed", passed ? REASON_CODES.ASSERTION_PASSED : REASON_CODES.DURATION_OUT_OF_RANGE, [start.eventId, end.eventId], {
        expected: { minMs: assertion.minMs ?? 0, maxMs: assertion.maxMs ?? "unbounded" },
        observed: { durationMs },
      });
    }
    case "forbidden-event": {
      const matches = findMatches(assertion.selector, events);
      return resultFor(assertion, matches.length > 0 ? "unsafe" : evidence.coverage.mode === "complete" ? "passed" : "not-evaluable", matches.length > 0 ? REASON_CODES.EVENT_FORBIDDEN : evidence.coverage.mode === "complete" ? REASON_CODES.ASSERTION_PASSED : REASON_CODES.COVERAGE_INCOMPLETE, matches.map((event) => event.eventId), {
        expected: "no forbidden event",
        observed: { count: matches.length },
      });
    }
  }
}

function resultFor(assertion: ContractAssertion, status: AssertionResult["status"], reasonCode: string, evidenceEventIds: string[], values: Pick<AssertionResult, "expected" | "observed">): AssertionResult {
  return {
    assertionId: assertion.id,
    description: assertion.description,
    kind: assertion.kind,
    required: assertion.required,
    status,
    reasonCode,
    evidenceEventIds,
    ...values,
  };
}

function findMatches(selector: EventSelector, events: EvidenceEvent[]): EvidenceEvent[] {
  return events.filter((event) => event.type === selector.type && (selector.where ?? []).every((predicate) => matchesPredicate(event, predicate)));
}

function matchesPredicate(event: EvidenceEvent, predicate: Predicate): boolean {
  const target = getPath(event, predicate.path);
  switch (predicate.op) {
    case "exists":
      return target.found === predicate.value;
    case "eq":
      return target.found && valuesEqual(target.value, predicate.value);
    case "neq":
      return !target.found || !valuesEqual(target.value, predicate.value);
    case "in":
      return target.found && predicate.values.some((value) => valuesEqual(target.value, value));
    case "notIn":
      return !target.found || !predicate.values.some((value) => valuesEqual(target.value, value));
    case "lt":
      return target.found && comparable(target.value, predicate.value, (left, right) => left < right);
    case "lte":
      return target.found && comparable(target.value, predicate.value, (left, right) => left <= right);
    case "gt":
      return target.found && comparable(target.value, predicate.value, (left, right) => left > right);
    case "gte":
      return target.found && comparable(target.value, predicate.value, (left, right) => left >= right);
  }
}

function comparable(left: unknown, right: unknown, compare: (left: number, right: number) => boolean): boolean {
  return typeof left === "number" && typeof right === "number" && compare(left, right);
}

function getPath(event: EvidenceEvent, path: string): { found: boolean; value?: unknown } {
  if (!path.startsWith("/")) return { found: false };
  const parts = path
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current: unknown = event;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) return { found: false };
    current = (current as Record<string, unknown>)[part];
  }
  return { found: true, value: current };
}

function getMissingStatus(evidence: EvidenceBundle): AssertionResult["status"] {
  return evidence.coverage.mode === "complete" ? "failed" : "not-evaluable";
}

function getCoverageIssues(contract: Contract, evidence: EvidenceBundle, events: EvidenceEvent[]): Array<{ code: string; message: string }> {
  const issues: Array<{ code: string; message: string }> = [];
  if (contract.capture.completeness === "required" && evidence.coverage.mode !== "complete") {
    issues.push({ code: REASON_CODES.COVERAGE_INCOMPLETE, message: "The contract requires complete capture coverage." });
  }
  if ((evidence.coverage.gaps?.length ?? 0) > 0) {
    issues.push({ code: REASON_CODES.EVIDENCE_GAP, message: "The evidence bundle declares one or more sequence gaps." });
  }
  for (const eventType of contract.capture.requiredEventTypes ?? []) {
    if (!events.some((event) => event.type === eventType)) {
      issues.push({ code: REASON_CODES.REQUIRED_EVENT_TYPE_MISSING, message: `Required event type \"${eventType}\" was not observed.` });
    }
  }
  if (contract.scope?.maxDurationMs !== undefined) {
    const duration = Date.parse(evidence.run.endedAt ?? evidence.run.startedAt) - Date.parse(evidence.run.startedAt);
    if (duration > contract.scope.maxDurationMs) {
      issues.push({ code: REASON_CODES.DURATION_OUT_OF_RANGE, message: "The run exceeded the contract duration limit." });
    }
  }
  return issues;
}

function isExplicitBlock(event: EvidenceEvent): boolean {
  return event.type === "action.blocked" || event.type === "policy.blocked" || event.payload.outcome === "blocked";
}

function classifyStatus(assertionResults: AssertionResult[], explicitBlock: EvidenceEvent | undefined, evidence: EvidenceBundle): VerificationResult["status"] {
  if (assertionResults.some((result) => result.status === "unsafe")) return "UNSAFE_BYPASS";
  if (explicitBlock || assertionResults.some((result) => result.status === "blocked")) return "BLOCKED";
  if (evidence.coverage.mode !== "complete" || assertionResults.some((result) => result.status === "not-evaluable")) return "INCONCLUSIVE";
  if (assertionResults.some((result) => result.required && result.status === "failed")) return "DRIFT";
  return "PASS";
}

function summarize(results: AssertionResult[]): VerificationResult["summary"] {
  return results.reduce(
    (summary, result) => {
      if (result.status === "passed") summary.passed += 1;
      if (result.status === "failed") summary.failed += 1;
      if (result.status === "blocked") summary.blocked += 1;
      if (result.status === "unsafe") summary.unsafe += 1;
      if (result.status === "not-evaluable") summary.inconclusive += 1;
      return summary;
    },
    { passed: 0, failed: 0, blocked: 0, unsafe: 0, inconclusive: 0 },
  );
}

function getProvenanceStatus(evidence: EvidenceBundle): VerificationResult["evidence"]["provenance"] {
  if (evidence.provenance.signature && evidence.provenance.integrity.bundleHash) return "verified";
  if (evidence.provenance.integrity.chain === "event-hash-chain" || evidence.provenance.integrity.bundleHash) return "tamper-evident";
  return "unverified";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
