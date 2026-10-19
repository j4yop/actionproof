import type { AssertionResult, EvidenceBundle, VerificationResult } from "./types";

/**
 * Evidence explorer model: a two-way inspection layer between assertions and
 * events. Selecting an assertion highlights its linked events; selecting an
 * event reveals the assertions it affects. Pure and deterministic — the model
 * is derived entirely from the verification result and the evidence bundle.
 */

export type ExplorerFilter = "all" | "decisive" | "unsafe" | "blocked";

export interface ExplorerEvent {
  event: EvidenceBundle["events"][number];
  classificationKind?: string;
  affectedAssertionIds: string[];
  decisive: boolean;
  unsafe: boolean;
  blocked: boolean;
}

export interface ExplorerModel {
  events: ExplorerEvent[];
  eventTypes: string[];
  unobservedAssertions: AssertionResult[];
  decisiveEventIds: string[];
}

export function buildExplorerModel(result: VerificationResult, events: EvidenceBundle["events"]): ExplorerModel {
  const eventById = new Map(events.map((event) => [event.eventId, event]));
  const assertionsByEvent = new Map<string, AssertionResult[]>();

  for (const assertion of result.assertionResults) {
    for (const eventId of assertion.evidenceEventIds) {
      const existing = assertionsByEvent.get(eventId) ?? [];
      existing.push(assertion);
      assertionsByEvent.set(eventId, existing);
    }
  }

  const isDecisive = (assertion: AssertionResult): boolean => assertion.status !== "passed";

  const explorerEvents: ExplorerEvent[] = events.map((event) => {
    const affected = assertionsByEvent.get(event.eventId) ?? [];
    const classificationKind = event.classification?.kind;
    const unsafe = affected.some((assertion) => assertion.status === "unsafe") || classificationKind === "unsafe-bypass";
    const blocked = affected.some((assertion) => assertion.status === "blocked") || classificationKind === "policy-block" || classificationKind === "action-block";
    const decisive = unsafe || blocked || affected.some(isDecisive) || Boolean(classificationKind && classificationKind !== "observation");
    return {
      event,
      classificationKind,
      affectedAssertionIds: affected.map((assertion) => assertId(assertion)),
      decisive,
      unsafe,
      blocked,
    };
  });

  const unobservedAssertions = result.assertionResults.filter(
    (assertion) => assertion.status !== "passed" && assertion.evidenceEventIds.length === 0,
  );

  return {
    events: explorerEvents,
    eventTypes: [...new Set(events.map((event) => event.type))].sort(),
    unobservedAssertions,
    decisiveEventIds: explorerEvents.filter((entry) => entry.decisive).map((entry) => entry.event.eventId),
  };
}

/** Events that share at least one affected assertion with the selected event. */
export function relatedEventIds(model: ExplorerModel, eventId: string): string[] {
  const selected = model.events.find((entry) => entry.event.eventId === eventId);
  if (!selected) return [];
  const assertionIds = new Set(selected.affectedAssertionIds);
  return model.events
    .filter((entry) => entry.affectedAssertionIds.some((assertionId) => assertionIds.has(assertionId)))
    .map((entry) => entry.event.eventId);
}

function assertId(assertion: AssertionResult): string {
  return assertion.assertionId;
}
