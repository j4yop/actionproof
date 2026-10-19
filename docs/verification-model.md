# Verification model

## Contract

A contract is a versioned, finite declaration of expected browser-agent behavior. It is data, not executable policy code.

Supported assertion kinds in v1:

- `event-present`: one event type and optional JSON-pointer predicates must appear within a count range.
- `event-absent`: a matching event must not appear in complete coverage.
- `event-order`: a matching `before` event must have a lower sequence number than a matching `after` event.
- `duration`: the first matching start/end pair must fall inside the declared millisecond range.
- `forbidden-event`: a matching event is classified as `UNSAFE_BYPASS`.

Selectors use JSON Pointer paths such as `/payload/action/name`. They support equality, inequality, numeric comparison, membership, and existence checks.

## Evidence

An evidence bundle is an ordered event trace. Each event has:

- a stable event ID;
- a monotonic sequence number;
- a type;
- an occurrence timestamp;
- an actor;
- a typed source/provenance description;
- structured payload data.

The verifier trusts the event sequence for ordering. Timestamps are used for duration only; browser and collector clocks must not decide event order.

Coverage is explicit:

- `complete`: the collector claims the relevant run was fully captured;
- `partial`: some trace is missing;
- `unknown`: completeness is not established.

## Classification precedence

The final result is selected in this order:

```text
UNSAFE_BYPASS
  > BLOCKED
  > INCONCLUSIVE
  > DRIFT
  > PASS
```

This prevents a successful-looking outcome from masking an unsafe path or missing proof.

## Edge cases

| Observation | Result |
| --- | --- |
| Required event missing from complete coverage | `DRIFT` |
| Required event missing from partial/unknown coverage | `INCONCLUSIVE` |
| Explicit policy or action block event | `BLOCKED` |
| Forbidden-event assertion matches | `UNSAFE_BYPASS` |
| One required assertion drifts and another is unevaluable | `INCONCLUSIVE` |
| All required assertions pass with complete coverage | `PASS` |
| Malformed JSON or schema | HTTP `400`/`422`, not a verification result |

## Determinism

Given the same contract, evidence, and verifier profile, the domain result has the same assertion outcomes and reason codes. Request IDs and creation timestamps are application metadata and are supplied from outside the pure verifier.

The verifier does not:

- call `Date.now()`;
- call a network service;
- open a browser;
- execute arbitrary input code;
- call an LLM;
- fetch screenshots or artifact URLs;
- infer success from the absence of a failure.

## Integrity profiles

`integrity: "none"` is supported for ordinary, unverified evidence. The result explicitly reports `unverified` provenance.

`integrity: "hash-chain"` is strict. The bundle must declare JCS canonicalization and SHA-256, every event must contain a valid hash, every predecessor link must match the preceding event, and the bundle hash must match the canonical bundle projection. A declaration without matching cryptographic material produces `INCONCLUSIVE`; metadata presence alone never earns `tamper-evident`.

`integrity: "signed"` remains fail-closed until a deployment supplies a trusted-key resolver. A signature field without trusted-key verification is `unverifiable`, not `verified`.

## Evidence admissibility

Before a decisive result, ActionProof checks the evidence boundary:

- complete coverage has explicit sequence bounds and a contiguous event range;
- declared event types match the actual trace;
- a complete run has a valid end timestamp;
- event timestamps fall inside the run window;
- contract validity windows and declared agent/workflow/environment identity match;
- declared origin and capability scopes have corresponding evidence;
- blocked results come from typed or legacy gate events, not arbitrary `payload.outcome` values.

Scope, identity, timing, coverage, and integrity failures are represented as `INCONCLUSIVE` when the document is structurally valid but cannot establish the claim.

## Resource limits

The public route caps request bodies at 512 KiB. The schemas and domain layer also bound event count, assertion count, selector predicates, metadata, artifact references, JSON Pointer depth, and payload depth. Resource-limit failures are rejected before a verdict is returned.
