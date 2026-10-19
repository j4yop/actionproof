# ActionProof

**Prove the action. Not the claim.**

ActionProof is a live, deterministic verifier for browser-agent evidence. A user submits two structured JSON documents:

1. A **contract** describing the behavior that should be allowed and observed.
2. An **evidence bundle** describing what the agent, browser, policy gate, and collector actually observed.

ActionProof returns an explainable verdict and links every assertion result back to the event IDs that support it.

## The problem

Browser agents can report success even when:

- a click never fired;
- the page changed underneath the agent;
- a success-looking toast appeared without the expected request;
- the agent bypassed a disabled or readonly control;
- the evidence trace is incomplete, stale, or contradictory.

A final screenshot or the agent's own final sentence is not enough to establish that an action happened, that it was authorized, or that the evidence was complete.

## Questions ActionProof answers

For a declared workflow, the verifier asks:

| Question | Evidence used |
| --- | --- |
| Did the expected event happen? | Event type, JSON-pointer predicates, and count bounds |
| Did events happen in the required order? | Monotonic event sequence numbers |
| Did the run stay inside the declared capability boundary? | Forbidden-event assertions and policy events |
| Did the workflow stay within a duration budget? | Explicit start/end event timestamps |
| Can a missing event be treated as a failure? | Coverage mode, declared gaps, and required event types |
| Can the result be trusted as a complete conclusion? | Provenance, integrity metadata, and fail-closed classification |

## The solution

ActionProof separates three responsibilities:

- **Contracts express expectations.** They are versioned JSON and contain a finite assertion DSL.
- **Evidence records observations.** Events are ordered, typed, attributed, and linked to capture provenance.
- **The verifier makes the conclusion.** It is a pure deterministic function with no browser, network, clock, or LLM dependency.

The public result taxonomy is:

| Result | Meaning |
| --- | --- |
| `PASS` | Required assertions passed with complete enough coverage. |
| `DRIFT` | Evidence is complete, but required behavior differs from the contract. |
| `BLOCKED` | A policy or action gate explicitly stopped the required flow. |
| `UNSAFE_BYPASS` | A forbidden capability or bypass was observed. |
| `INCONCLUSIVE` | Evidence is missing, partial, contradictory, or not strong enough to conclude. |

Invalid JSON and invalid schemas are API errors, not verification results.

## Live console workflow

1. Open the deployed ActionProof console.
2. Load a fixture or paste a contract and evidence bundle.
3. Press **Verify evidence**.
4. The browser sends the two documents to `POST /api/verify`.
5. The API validates the transport shape and domain references.
6. The pure verifier evaluates the assertions against the submitted events.
7. The console renders the verdict, summary, event references, coverage, provenance, hashes, and machine-readable receipt.

The fixture buttons are only input presets. They do not contain or display precomputed verdicts. Every fixture is sent through the same API and verifier path as custom judge input.

For stricter workflows, contracts can require hash-chain integrity. In that mode ActionProof validates canonical event hashes, predecessor links, and the bundle hash before it can return `PASS`. Signed evidence remains `INCONCLUSIVE` until a trusted-key resolver is configured; a self-declared signature is never treated as verified.

## Architecture

```text
┌─────────────────────┐       POST /api/verify       ┌─────────────────────────┐
│  Live console       │ ───────────────────────────▶ │  Next.js Route Handler  │
│  Contract editor    │                              │  JSON + size validation │
│  Evidence editor    │ ◀─────────────────────────── │  HTTP error mapping     │
└─────────────────────┘          result              └───────────┬─────────────┘
                                                                │
                                                                ▼
                                                     ┌─────────────────────────┐
                                                     │  ActionProof domain      │
                                                     │  schema + domain checks  │
                                                     │  assertion evaluation    │
                                                     │  result classification    │
                                                     └───────────┬─────────────┘
                                                                │
                                                                ▼
                                                     ┌─────────────────────────┐
                                                     │  Verification receipt    │
                                                     │  status + reason codes   │
                                                     │  event IDs + hashes      │
                                                     └─────────────────────────┘
```

The domain verifier does not import Next.js, React, browser APIs, network clients, or an LLM SDK. The route handler owns HTTP concerns; the UI owns presentation; the domain owns the conclusion.

## Repository map

```text
src/
  app/
    api/verify/route.ts       HTTP boundary and hashing context
    page.tsx                  Live console entry point
    globals.css               Forensic control-room visual system
  components/
    actionproof-console.tsx   Interactive editors and result view
  domain/actionproof/
    types.ts                  Public protocol types
    schemas.ts                Strict runtime input schemas
    validation.ts             Cross-document domain validation
    verify.ts                 Pure assertion evaluation and classification
    examples.ts               Committed input fixtures, not result fixtures
    stable-json.ts            Deterministic object comparison/fingerprints
docs/
  architecture.md             Module and deployment boundaries
  verification-model.md       Contract, evidence, and result semantics
```

## Tech stack

- Next.js 16 App Router
- TypeScript 5.9 with strict checking
- React 19
- Zod 4 for runtime JSON validation
- Vitest for domain tests
- Vercel for the public deployment
- No runtime database, browser automation, external model, or API key required for the MVP

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

The buildathon-style check can run against the production server:

```bash
npm run build
npm start
```

## Scope boundaries

ActionProof does not claim to be:

- a browser agent;
- a general browser replay engine;
- a screenshot or DOM truth oracle;
- an LLM trajectory judge;
- a complete sandbox for arbitrary untrusted code;
- a security certification or compliance framework.

It verifies structured evidence according to explicit contracts and reports when that evidence is not sufficient.

## Design principles

- Missing evidence never silently becomes `PASS`.
- Declared integrity is not accepted without matching cryptographic material.
- Declared scope, identity, coverage, and timing must be evidenced before a decisive result.
- A confirmed unsafe path takes precedence over a successful-looking outcome.
- Event sequence, not clock skew, establishes ordering.
- User-provided expectations are data, not code.
- The live UI and API share the same dynamic verification path.
