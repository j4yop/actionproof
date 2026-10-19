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
import { assessIntegrity } from "./integrity";

export function verify(contract: Contract, evidence: EvidenceBundle, context: VerificationContext): VerificationResult {
  const validationIssues = validateDomainInputs(contract, evidence);
  if (validationIssues.length > 0) {
    throw new VerificationInputError(validationIssues);
  }

  const events = [...evidence.events].sort((left, right) => left.sequence - right.sequence);
  const integrity = assessIntegrity(contract, evidence);
  const assertionResults = [
    ...contract.assertions.map((assertion) => evaluateAssertion(assertion, evidence, events)),
    ...getPreflightResults(contract, evidence, events, integrity),
  ];

  const explicitBlock = events.find((event) => isExplicitBlock(event));
  const status = classifyStatus(contract, assertionResults, explicitBlock, evidence, integrity);
  const reasonCodes = uniqueStrings([
    ...assertionResults.map((result) => result.reasonCode),
    ...integrity.reasonCodes,
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
      provenance: integrity.provenance,
      integrity: {
        bundle: integrity.bundle,
        chain: integrity.chain,
        signature: integrity.signature,
      },
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
      if (durationMs < 0) {
        return resultFor(assertion, "not-evaluable", REASON_CODES.EVENT_TIME_ORDER_INVALID, [start.eventId, end.eventId], {
          expected: "end timestamp after start timestamp",
          observed: { durationMs },
        });
      }
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
      return target.found && !valuesEqual(target.value, predicate.value);
    case "in":
      return target.found && predicate.values.some((value) => valuesEqual(target.value, value));
    case "notIn":
      return target.found && !predicate.values.some((value) => valuesEqual(target.value, value));
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
  if (!path.startsWith("/") || path.length > 512 || /~[^01]/.test(path)) return { found: false };
  const parts = path
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  if (parts.length > 32 || parts.some((part) => part === "__proto__" || part === "prototype" || part === "constructor")) return { found: false };
  let current: unknown = event;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, part)) return { found: false };
    current = (current as Record<string, unknown>)[part];
  }
  return { found: true, value: current };
}

function getMissingStatus(evidence: EvidenceBundle): AssertionResult["status"] {
  return evidence.coverage.mode === "complete" ? "failed" : "not-evaluable";
}

function getPreflightResults(contract: Contract, evidence: EvidenceBundle, events: EvidenceEvent[], integrity: ReturnType<typeof assessIntegrity>): AssertionResult[] {
  const results: AssertionResult[] = [];
  const actualEventTypes = [...new Set(events.map((event) => event.type))].sort();
  const declaredEventTypes = [...new Set(evidence.coverage.observedEventTypes)].sort();
  const isComplete = evidence.coverage.mode === "complete";

  if (contract.capture.completeness === "required" && !isComplete) {
    results.push(preflightResult("coverage:complete", "The contract requires complete capture coverage.", "not-evaluable", REASON_CODES.COVERAGE_INCOMPLETE));
  }

  if (isComplete) {
    if (evidence.coverage.startSequence === undefined || evidence.coverage.endSequence === undefined) {
      results.push(preflightResult("coverage:bounds", "Complete coverage must declare its first and last event sequence.", "not-evaluable", REASON_CODES.COVERAGE_BOUNDS_MISSING));
    } else {
      const actualSequences = events.map((event) => event.sequence);
      const actualStart = Math.min(...actualSequences);
      const actualEnd = Math.max(...actualSequences);
      const isContiguous = actualEnd - actualStart + 1 === actualSequences.length && actualSequences.every((sequence, index) => sequence === actualStart + index);
      if (actualStart !== evidence.coverage.startSequence || actualEnd !== evidence.coverage.endSequence || !isContiguous) {
        results.push(preflightResult("coverage:sequence", "The declared complete sequence is missing, out of bounds, or non-contiguous.", "not-evaluable", REASON_CODES.COVERAGE_SEQUENCE_GAP, [], {
          expected: { startSequence: evidence.coverage.startSequence, endSequence: evidence.coverage.endSequence, contiguous: true },
          observed: { startSequence: actualStart, endSequence: actualEnd, contiguous: isContiguous },
        }));
      }
    }
    if ((evidence.coverage.gaps?.length ?? 0) > 0) {
      results.push(preflightResult("coverage:gaps", "Complete coverage cannot declare sequence gaps.", "not-evaluable", REASON_CODES.COVERAGE_SEQUENCE_GAP));
    }
    if (actualEventTypes.join("\u0000") !== declaredEventTypes.join("\u0000")) {
      results.push(preflightResult("coverage:event-types", "Declared event types do not match the observed event types.", "not-evaluable", REASON_CODES.COVERAGE_DECLARATION_MISMATCH, [], {
        expected: declaredEventTypes,
        observed: actualEventTypes,
      }));
    }
  }

  for (const eventType of contract.capture.requiredEventTypes ?? []) {
    if (!events.some((event) => event.type === eventType)) {
      results.push(preflightResult(`coverage:event:${eventType}`, `Required event type \"${eventType}\" was not observed.`, isComplete ? "failed" : "not-evaluable", REASON_CODES.REQUIRED_EVENT_TYPE_MISSING));
    }
  }

  const startedAt = Date.parse(evidence.run.startedAt);
  const endedAt = evidence.run.endedAt ? Date.parse(evidence.run.endedAt) : undefined;
  if (isComplete && endedAt === undefined) {
    results.push(preflightResult("temporal:run-end", "Complete coverage requires a run end timestamp.", "not-evaluable", REASON_CODES.RUN_END_MISSING));
  }
  if (endedAt !== undefined && endedAt < startedAt) {
    results.push(preflightResult("temporal:run-window", "The run ended before it started.", "not-evaluable", REASON_CODES.RUN_END_BEFORE_START));
  }
  const eventOutsideRun = events.filter((event) => {
    const occurredAt = Date.parse(event.occurredAt);
    return occurredAt < startedAt || (endedAt !== undefined && occurredAt > endedAt);
  });
  if (eventOutsideRun.length > 0) {
    results.push(preflightResult("temporal:event-window", "One or more events fall outside the declared run window.", "not-evaluable", REASON_CODES.EVENT_OUTSIDE_RUN, eventOutsideRun.map((event) => event.eventId)));
  }

  if (contract.validFrom && startedAt < Date.parse(contract.validFrom)) {
    results.push(preflightResult("temporal:valid-from", "The evidence run began before the contract became valid.", "not-evaluable", REASON_CODES.CONTRACT_NOT_YET_VALID));
  }
  if (contract.validUntil) {
    if (endedAt === undefined || endedAt > Date.parse(contract.validUntil)) {
      results.push(preflightResult("temporal:valid-until", "The evidence run is outside the contract validity window.", "not-evaluable", REASON_CODES.CONTRACT_EXPIRED));
    }
  }
  if (contract.scope?.maxDurationMs !== undefined) {
    if (endedAt === undefined || endedAt < startedAt) {
      results.push(preflightResult("scope:max-duration", "The duration budget cannot be evaluated without a valid run window.", "not-evaluable", REASON_CODES.DURATION_NOT_OBSERVABLE));
    } else if (endedAt - startedAt > contract.scope.maxDurationMs) {
      results.push(preflightResult("scope:max-duration", "The run exceeded the contract duration limit.", "failed", REASON_CODES.DURATION_OUT_OF_RANGE, [], {
        expected: { maxDurationMs: contract.scope.maxDurationMs },
        observed: { durationMs: endedAt - startedAt },
      }));
    }
  }

  const identityChecks = [
    ["agentRef", contract.subject.agentRef, evidence.run.agentRef],
    ["workflowRef", contract.subject.workflowRef, evidence.run.workflowRef],
    ["environment", contract.subject.environment, evidence.run.environment],
  ] as const;
  for (const [field, expected, observed] of identityChecks) {
    if (expected !== undefined && observed === undefined) {
      results.push(preflightResult(`identity:${field}`, `The evidence run is missing the declared ${field} binding.`, "not-evaluable", REASON_CODES.IDENTITY_BINDING_MISSING));
    } else if (expected !== undefined && expected !== observed) {
      results.push(preflightResult(`identity:${field}`, `The evidence run does not match the contract ${field}.`, "not-evaluable", REASON_CODES.IDENTITY_MISMATCH, [], { expected, observed }));
    }
  }
  if (contract.subject.agentRef) {
    const mismatchedActors = events.filter((event) => event.actor.kind === "browser-agent" && event.actor.ref !== contract.subject.agentRef);
    if (mismatchedActors.length > 0) {
      results.push(preflightResult("identity:actors", "A browser-agent event has an actor reference outside the contract identity.", "not-evaluable", REASON_CODES.ACTOR_IDENTITY_MISMATCH, mismatchedActors.map((event) => event.eventId), {
        expected: contract.subject.agentRef,
        observed: mismatchedActors.map((event) => event.actor.ref ?? "missing"),
      }));
    }
  }

  if (contract.scope?.allowedOrigins) {
    const originEntries = events.map((event) => ({ event, origin: readOrigin(event) }));
    const originRelevant = originEntries.filter(({ event }) => event.type.startsWith("navigation") || getPath(event, "/payload/url").found || getPath(event, "/payload/origin").found);
    const originObservations = originEntries.filter((entry): entry is { event: EvidenceEvent; origin: string } => typeof entry.origin === "string");
    const missingOrigin = originRelevant.filter(({ origin }) => typeof origin !== "string");
    if (originObservations.length === 0 || missingOrigin.length > 0) {
      results.push(preflightResult("scope:origins", "The declared origin scope is not fully evidenced by the trace.", "not-evaluable", REASON_CODES.SCOPE_BINDING_MISSING, missingOrigin.map(({ event }) => event.eventId)));
    }
    const allowedOrigins = contract.scope.allowedOrigins.map(normalizeOrigin).filter((origin): origin is string => origin !== null);
    const violations = originObservations.filter(({ origin }) => !allowedOrigins.includes(normalizeOrigin(origin) ?? ""));
    if (violations.length > 0) {
      results.push(preflightResult("scope:allowed-origins", "The trace contains an origin outside the contract scope.", "failed", REASON_CODES.ORIGIN_OUTSIDE_SCOPE, violations.map(({ event }) => event.eventId), {
        expected: allowedOrigins,
        observed: violations.map(({ origin }) => origin),
      }));
    }
  }
  if (contract.scope?.allowedCapabilities) {
    const allowedCapabilities = contract.scope.allowedCapabilities;
    const capabilityEntries = events.map((event) => ({ event, capability: getPath(event, "/payload/capability").value }));
    const capabilityRelevant = capabilityEntries.filter(({ event }) => event.type === "capability.used" || getPath(event, "/payload/capability").found);
    const capabilityObservations = capabilityEntries.filter((entry): entry is { event: EvidenceEvent; capability: string } => typeof entry.capability === "string");
    const missingCapability = capabilityRelevant.filter(({ capability }) => typeof capability !== "string");
    if (capabilityObservations.length === 0 || missingCapability.length > 0) {
      results.push(preflightResult("scope:capabilities", "The declared capability scope is not fully evidenced by the trace.", "not-evaluable", REASON_CODES.CAPABILITY_BINDING_MISSING, missingCapability.map(({ event }) => event.eventId)));
    }
    const violations = capabilityObservations.filter(({ capability }) => !allowedCapabilities.includes(capability));
    if (violations.length > 0) {
      results.push(preflightResult("scope:allowed-capabilities", "The trace used a capability outside the contract scope.", "unsafe", REASON_CODES.CAPABILITY_OUTSIDE_SCOPE, violations.map(({ event }) => event.eventId), {
        expected: allowedCapabilities,
        observed: violations.map(({ capability }) => capability),
      }));
    }
  }

  if (contract.capture.integrity !== "none") {
    if (integrity.chain !== "verified" && contract.capture.integrity === "hash-chain") {
      results.push(preflightResult("integrity:chain", "The required event hash chain could not be verified.", "not-evaluable", integrity.reasonCodes.find((code) => code.includes("HASH")) ?? REASON_CODES.HASH_CHAIN_MISSING));
    }
    if (integrity.bundle !== "verified" && contract.capture.integrity === "hash-chain") {
      results.push(preflightResult("integrity:bundle", "The required evidence bundle hash could not be verified.", "not-evaluable", integrity.reasonCodes.includes(REASON_CODES.BUNDLE_HASH_MISMATCH) ? REASON_CODES.BUNDLE_HASH_MISMATCH : REASON_CODES.BUNDLE_HASH_MISSING));
    }
    if (contract.capture.integrity === "signed" && integrity.signature !== "verified") {
      results.push(preflightResult("integrity:signature", "The evidence signature cannot be verified by this deployment.", "not-evaluable", integrity.signature === "missing" ? REASON_CODES.SIGNATURE_MISSING : REASON_CODES.SIGNATURE_UNVERIFIABLE));
    }
  }

  const block = events.find((event) => isExplicitBlock(event));
  if (block) {
    results.push(preflightResult(`block:${block.eventId}`, "An explicit policy or action gate blocked the workflow.", "blocked", block.classification?.kind === "action-block" || block.type === "action.blocked" ? REASON_CODES.EXPLICIT_ACTION_BLOCK : REASON_CODES.EXPLICIT_POLICY_BLOCK, [block.eventId]));
  }
  const unsafeClassification = events.find((event) => event.classification?.kind === "unsafe-bypass");
  if (unsafeClassification) {
    results.push(preflightResult(`unsafe:${unsafeClassification.eventId}`, "The evidence explicitly classifies this event as an unsafe bypass.", "unsafe", REASON_CODES.EVENT_FORBIDDEN, [unsafeClassification.eventId]));
  }

  return results;
}

function preflightResult(assertionId: string, description: string, status: AssertionResult["status"], reasonCode: string, evidenceEventIds: string[] = [], values: Pick<AssertionResult, "expected" | "observed"> = {}): AssertionResult {
  return {
    assertionId,
    description,
    kind: "event-present",
    required: true,
    status,
    reasonCode,
    evidenceEventIds,
    ...values,
  };
}

function isExplicitBlock(event: EvidenceEvent): boolean {
  if (event.classification?.kind === "action-block" || event.classification?.kind === "policy-block") return true;
  if (event.type === "policy.blocked") return event.actor.kind === "policy-gate" || event.source.sourceKind === "policy-gate";
  if (event.type === "action.blocked") return event.actor.kind === "browser-agent" || event.actor.kind === "browser" || event.source.sourceKind === "agent-runtime" || event.source.sourceKind === "browser-instrumentation";
  return false;
}

function classifyStatus(contract: Contract, assertionResults: AssertionResult[], explicitBlock: EvidenceEvent | undefined, evidence: EvidenceBundle, integrity: ReturnType<typeof assessIntegrity>): VerificationResult["status"] {
  if (contract.capture.integrity !== "none" && !integrityIsAdmissible(contract, integrity)) return "INCONCLUSIVE";
  if (assertionResults.some((result) => result.status === "unsafe")) return "UNSAFE_BYPASS";
  if (explicitBlock || assertionResults.some((result) => result.status === "blocked")) return "BLOCKED";
  if (evidence.coverage.mode !== "complete" || assertionResults.some((result) => result.required && result.status === "not-evaluable")) return "INCONCLUSIVE";
  if (assertionResults.some((result) => result.required && result.status === "failed")) return "DRIFT";
  return "PASS";
}

function integrityIsAdmissible(contract: Contract, integrity: ReturnType<typeof assessIntegrity>): boolean {
  if (contract.capture.integrity === "hash-chain") return integrity.chain === "verified" && integrity.bundle === "verified";
  if (contract.capture.integrity === "signed") return integrity.signature === "verified";
  return true;
}

function summarize(results: AssertionResult[]): VerificationResult["summary"] {
  const summary = results.reduce(
    (summary, result) => {
      if (result.status === "passed") summary.passed += 1;
      if (result.status === "failed") summary.failed += 1;
      if (result.status === "blocked") summary.blocked += 1;
      if (result.status === "unsafe") {
        summary.unsafe += 1;
        result.evidenceEventIds.forEach((eventId) => summary.unsafeEvents.add(eventId));
      }
      if (result.status === "not-evaluable") summary.inconclusive += 1;
      return summary;
    },
    { passed: 0, failed: 0, blocked: 0, unsafe: 0, unsafeEvents: new Set<string>(), inconclusive: 0 },
  );

  return {
    ...summary,
    unsafeEvents: summary.unsafeEvents.size,
  };
}

function readOrigin(event: EvidenceEvent): string | undefined {
  const nestedOrigin = getPath(event, "/payload/url/origin").value;
  const directOrigin = getPath(event, "/payload/origin").value;
  return typeof nestedOrigin === "string" ? nestedOrigin : typeof directOrigin === "string" ? directOrigin : undefined;
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
