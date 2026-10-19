# ActionProof

### Prove the action. Not the claim.

**Live console:** https://actionproof-one.vercel.app
**Repository:** https://github.com/j4yop/actionproof
**Track:** Developer Tools & Open Source

ActionProof is a deterministic, fail-closed verifier for browser-agent evidence. It accepts a workflow contract and an evidence bundle, then returns an explainable verdict linked to the exact events that support it.

## The problem

Browser agents can claim success when:

- a click never fired;
- the UI changed underneath the agent;
- a success message appeared without the expected request;
- a disabled control was bypassed;
- the evidence trace is partial, stale, or contradictory.

A final screenshot or the agent’s own final message is not enough to prove that an action happened, was authorized, or was fully observed.

## The questions we ask

For every submitted workflow, ActionProof asks:

1. Did the expected events happen?
2. Did they happen in the required order?
3. Did the run stay inside the allowed origin and capability scope?
4. Did it stay inside the declared time and identity boundaries?
5. Is the evidence complete and internally consistent?
6. Was a forbidden capability, bypass, or policy block observed?
7. Is there enough trustworthy evidence to make a decisive conclusion?

## The solution

ActionProof separates the problem into three data-driven layers:

```text
Contract     → what should happen
Evidence     → what was observed
Verifier     → what the evidence proves
```

The verifier evaluates a finite assertion language for event presence, absence, ordering, duration, and forbidden events. It also validates coverage, scope, identity, timing, resource limits, and optional cryptographic hash-chain integrity.

It does not open a browser, call an LLM, fetch remote artifacts, or execute user-provided code during verification.

## Verdicts

| Verdict | Meaning |
| --- | --- |
| `PASS` | Required behavior passed with complete, admissible evidence. |
| `DRIFT` | Evidence is complete, but behavior differs from the contract. |
| `BLOCKED` | A typed policy or action gate stopped the workflow. |
| `UNSAFE_BYPASS` | A forbidden capability or bypass was observed. |
| `INCONCLUSIVE` | Evidence is missing, contradictory, out of scope, or not trustworthy enough. |

Precedence is:

```text
UNSAFE_BYPASS > BLOCKED > INCONCLUSIVE > DRIFT > PASS
```

Missing evidence never silently becomes `PASS`.

## How it works

1. Open the [live console](https://actionproof-one.vercel.app).
2. Load a fixture or paste your own contract and evidence JSON.
3. Select **Verify evidence**.
4. `POST /api/verify` validates the request and resource limits.
5. The domain verifier checks integrity, coverage, timing, identity, scope, blocks, and assertions.
6. The console renders the verdict, reason codes, evidence event IDs, coverage, provenance, hashes, and machine-readable receipt.

The fixture buttons only load example **inputs**. They do not contain precomputed verdicts; every run goes through the same live API path used by custom judge input.

## Architecture

```text
┌──────────────────┐       POST /api/verify       ┌────────────────────┐
│ Live web console  │ ──────────────────────────▶ │ Next.js API route  │
│ JSON inputs       │ ◀────────────────────────── │ schema + limits    │
└──────────────────┘           receipt            └─────────┬──────────┘
                                                           ▼
                                                ┌────────────────────┐
                                                │ Pure domain        │
                                                │ validation         │
                                                │ integrity          │
                                                │ scope + coverage   │
                                                │ assertion engine   │
                                                └─────────┬──────────┘
                                                          ▼
                                                Explainable verdict
```

The domain verifier is independent of Next.js, React, browser APIs, network clients, and model SDKs.

## Tech stack

- Next.js 16 App Router
- React 19
- TypeScript 5.9, strict mode
- Zod 4 runtime schemas
- JCS canonicalization with SHA-256 integrity checks
- Vitest 4 regression and API tests
- Vercel production deployment

No database, credentials, hosted model, or browser automation runtime is required for the current MVP.

## Verification boundaries

ActionProof verifies the evidence bundle it receives. It does not independently prove that an untrusted collector captured every real-world action. Stronger trust comes from trusted browser instrumentation, policy gates, network capture, and signed evidence producers.

Signed evidence is intentionally fail-closed until a trusted-key resolver is configured. A self-declared signature is never treated as verified.

## Local development

```bash
npm ci
npm run dev
```

Open http://localhost:3000.

## Checks

```bash
npm run typecheck
npm test
npm run build
npm audit
```

Current repository checks include **18 tests** and report **0 npm audit vulnerabilities**.

## Built with OmniRush

OmniRush was used for the product research, architecture, implementation, adversarial review, test design, hardening, and deployment workflow. The result is a deterministic product that does not require generative AI at runtime.
