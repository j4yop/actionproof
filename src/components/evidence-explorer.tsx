"use client";

import { useMemo, useState } from "react";
import { buildExplorerModel, relatedEventIds, type ExplorerFilter } from "@/domain/actionproof/explorer";
import type { EvidenceBundle, VerificationResult } from "@/domain/actionproof/types";

type EvidenceEvent = EvidenceBundle["events"][number];

const FILTERS: Array<{ key: ExplorerFilter; label: string }> = [
  { key: "all", label: "All events" },
  { key: "decisive", label: "Decisive" },
  { key: "unsafe", label: "Unsafe" },
  { key: "blocked", label: "Blocked" },
];

export function EvidenceExplorer({ result, events }: { result: VerificationResult; events: EvidenceEvent[] }) {
  const model = useMemo(() => buildExplorerModel(result, events), [result, events]);
  const [filter, setFilter] = useState<ExplorerFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const linkedIds = useMemo(() => (selectedEventId ? new Set(relatedEventIds(model, selectedEventId)) : null), [model, selectedEventId]);
  const selectedEvent = selectedEventId ? model.events.find((entry) => entry.event.eventId === selectedEventId) : undefined;

  const visible = model.events.filter((entry) => {
    if (filter === "decisive" && !entry.decisive) return false;
    if (filter === "unsafe" && !entry.unsafe) return false;
    if (filter === "blocked" && !entry.blocked) return false;
    if (typeFilter !== "all" && entry.event.type !== typeFilter) return false;
    return true;
  });

  const selectedAffected = selectedEvent
    ? result.assertionResults.filter((assertion) => selectedEvent.affectedAssertionIds.includes(assertion.assertionId))
    : [];

  return (
    <div className="result-section explorer" aria-label="Evidence explorer">
      <div className="section-heading"><span>EVIDENCE EXPLORER</span><small>{model.events.length} events · {model.decisiveEventIds.length} decisive</small></div>

      <div className="explorer-controls">
        <div className="explorer-filters" role="group" aria-label="Event filters">
          {FILTERS.map((entry) => (
            <button key={entry.key} type="button" className={`explorer-filter ${filter === entry.key ? "is-active" : ""}`} aria-pressed={filter === entry.key} onClick={() => setFilter(entry.key)}>
              {entry.label}
            </button>
          ))}
        </div>
        <label className="explorer-type">
          <span>Event type</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by event type">
            <option value="all">All types</option>
            {model.eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
      </div>

      {model.unobservedAssertions.length > 0 && (
        <div className="explorer-missing" role="note">
          <span>NOT OBSERVED</span>
          {model.unobservedAssertions.map((assertion) => (
            <code key={assertion.assertionId}>{assertion.description || assertion.assertionId} — no linked event exists in this bundle ({assertion.reasonCode.replaceAll("_", " ").toLowerCase()})</code>
          ))}
        </div>
      )}

      {(result.coverage.gaps?.length ?? 0) > 0 && (
        <div className="explorer-gaps" role="note">
          <span>COVERAGE GAPS</span>
          {result.coverage.gaps?.map((gap, index) => (
            <code key={index}>sequences {gap.fromSequence}–{gap.toSequence}{gap.reason ? ` · ${gap.reason}` : ""}</code>
          ))}
        </div>
      )}
      {result.coverage.mode !== "complete" && (result.coverage.gaps?.length ?? 0) === 0 && (
        <div className="explorer-gaps" role="note">
          <span>COVERAGE</span>
          <code>coverage is {result.coverage.mode} — the trace may not describe the whole run</code>
        </div>
      )}

      <div className="explorer-body">
        <ul className="explorer-events">
          {visible.map(({ event, classificationKind, affectedAssertionIds, decisive, unsafe, blocked }) => (
            <li key={event.eventId}>
              <button
                type="button"
                className={[
                  "explorer-event",
                  selectedEventId === event.eventId ? "is-selected" : "",
                  linkedIds?.has(event.eventId) ? "is-linked" : "",
                  unsafe ? "is-unsafe" : blocked ? "is-blocked" : decisive ? "is-decisive" : "",
                ].join(" ")}
                onClick={() => setSelectedEventId((current) => (current === event.eventId ? null : event.eventId))}
                aria-pressed={selectedEventId === event.eventId}
              >
                <span className="explorer-event-top">
                  <code>#{event.sequence}</code>
                  <strong>{event.type}</strong>
                  {unsafe && <em className="explorer-flag flag-unsafe">unsafe</em>}
                  {blocked && <em className="explorer-flag flag-blocked">blocked</em>}
                  {!unsafe && !blocked && decisive && <em className="explorer-flag flag-decisive">decisive</em>}
                  {classificationKind && classificationKind !== "observation" && <em className="explorer-flag flag-class">{classificationKind}</em>}
                </span>
                <span className="explorer-event-meta">
                  {event.occurredAt} · actor {event.actor.kind}{event.actor.ref ? ` ${event.actor.ref}` : ""} · collector {event.source.sourceId} v{event.source.sourceVersion}
                  {event.integrity ? ` · hash ${event.integrity.eventHash.slice(0, 10)}…` : " · unsigned"}
                  {affectedAssertionIds.length > 0 ? ` · ${affectedAssertionIds.length} assertion${affectedAssertionIds.length === 1 ? "" : "s"}` : " · no assertions"}
                </span>
              </button>
            </li>
          ))}
          {visible.length === 0 && <li className="explorer-empty">No events match this filter.</li>}
        </ul>

        <div className="explorer-detail" aria-live="polite">
          {selectedEvent ? (
            <>
              <div className="explorer-detail-head">
                <strong>{selectedEvent.event.eventId}</strong>
                <span>{selectedEvent.event.type}</span>
              </div>
              <div className="explorer-detail-grid">
                <div><span>Sequence</span><code>{selectedEvent.event.sequence}</code></div>
                <div><span>Occurred</span><code>{selectedEvent.event.occurredAt}</code></div>
                <div><span>Actor</span><code>{selectedEvent.event.actor.kind}{selectedEvent.event.actor.ref ? ` · ${selectedEvent.event.actor.ref}` : ""}</code></div>
                <div><span>Collector</span><code>{selectedEvent.event.source.sourceId} · {selectedEvent.event.source.sourceKind} · v{selectedEvent.event.source.sourceVersion}</code></div>
                <div><span>Captured at</span><code>{selectedEvent.event.source.capturedAt}</code></div>
                <div><span>Integrity</span><code>{selectedEvent.event.integrity ? `hash ${selectedEvent.event.integrity.eventHash.slice(0, 16)}…${selectedEvent.event.integrity.previousEventHash ? ` ← ${selectedEvent.event.integrity.previousEventHash.slice(0, 10)}…` : " ← genesis"}` : "not hashed"}</code></div>
              </div>
              <div className="explorer-detail-block"><span>Payload</span><pre>{JSON.stringify(selectedEvent.event.payload, null, 2)}</pre></div>
              <div className="explorer-detail-block">
                <span>Affected assertions ({selectedAffected.length})</span>
                {selectedAffected.length > 0 ? (
                  <ul className="explorer-assertions">
                    {selectedAffected.map((assertion) => (
                      <li key={assertion.assertionId}>
                        <span className={`assertion-marker marker-${assertion.status}`} aria-hidden="true" />
                        <code>{assertion.description || assertion.assertionId} — {assertionStatusLabel(assertion.status)} · {assertion.reasonCode.replaceAll("_", " ")}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <code>No assertion depends on this event.</code>
                )}
              </div>
            </>
          ) : (
            <p className="explorer-hint">Select an event to see what it proves — and which assertions depend on it. Selecting an assertion in the trace highlights its events here.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function assertionStatusLabel(status: VerificationResult["assertionResults"][number]["status"]): string {
  if (status === "passed") return "Passed";
  if (status === "failed") return "Drifted";
  if (status === "blocked") return "Blocked";
  if (status === "unsafe") return "Unsafe";
  return "Not evaluable";
}
