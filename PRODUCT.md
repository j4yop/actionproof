# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Next.js App Router with TypeScript, deployed to Vercel. The stack keeps the deterministic verifier reusable as a pure domain module while giving judges a public, interactive web surface.

## Users

Primary users are developers and teams building browser agents, browser automation, and computer-use workflows. They need to decide whether an agent's claimed success is supported by observable, policy-compliant evidence before trusting the result.

Secondary users are judges, reviewers, and maintainers who want to paste a contract and an evidence bundle into a live tool and understand the result without installing a browser, model, or local runtime.

## Product Purpose

ActionProof evaluates a versioned workflow contract against a structured browser-agent evidence bundle. It answers whether the required actions happened in the required order, whether the observed state matches the contract, whether a forbidden capability or bypass occurred, and whether the evidence is complete enough to make a trustworthy conclusion.

Success means a user can submit their own valid JSON inputs, receive a deterministic result, inspect every assertion and evidence reference, and understand why a run is PASS, DRIFT, BLOCKED, UNSAFE_BYPASS, or INCONCLUSIVE.

## Positioning

ActionProof is not another browser agent, browser runner, screenshot viewer, or LLM judge. Its differentiating mechanism is a no-browser, no-LLM verification kernel that consumes portable evidence and fails closed when the evidence cannot establish the claim.

## Operating Context

Users work with two JSON documents: a contract describing expected behavior and an evidence bundle describing observed events. They can edit or paste both in the live web console, run verification, inspect a result summary, open assertion-level evidence, and copy the resulting JSON receipt. Local fixtures demonstrate the workflow but are not the only accepted inputs.

## Capabilities and Constraints

- Accept a structured contract and evidence bundle as runtime input.
- Validate schemas and semantic references before evaluating assertions.
- Support finite, explicit assertion kinds rather than arbitrary code execution.
- Evaluate event presence, absence, ordering, duration, and forbidden capabilities.
- Produce deterministic statuses: `PASS`, `DRIFT`, `BLOCKED`, `UNSAFE_BYPASS`, and `INCONCLUSIVE`.
- Show assertion-level expected values, observed values, event references, reason codes, hashes, coverage, and provenance.
- Provide demo fixtures that can be loaded into the editor, while keeping the verifier data-driven.
- Run without a browser, network request, LLM, or current-clock dependency during verification.
- Do not claim that a final screenshot alone proves an action happened.
- Keep the MVP framework-neutral at the evidence boundary and avoid live-site crawling, authentication flows, cloud browser fleets, or arbitrary user code.
- The public site must accept new inputs and calculate new results; demo data cannot be the only path.

## Brand Commitments

- Product name: ActionProof (working name; check GitHub name availability before publishing).
- Voice: precise, calm, evidence-first, and honest about uncertainty.
- Explanations must distinguish invalid input from an inconclusive verification.
- Do not use inflated security, compliance, or reproducibility claims.

## Evidence on Hand

- Buildathon research and competitive audit: `/Users/jaygopal/.agent-reach/reports/shipshape-competitive-audit.md`.
- Alternative project research: `/Users/jaygopal/.agent-reach/reports/alternative-project-ideation.md`.
- Council transcript and report: `/Users/jaygopal/.agent-reach/reports/council-transcript-20261019-014114.md` and `/Users/jaygopal/.agent-reach/reports/council-report-20261019-014114.html`.
- Primary source showing browser-agent false-success and disabled-control bypass concerns: `https://github.com/browser-use/browser-use/issues/6068`.
- Primary source showing action success can be reported without a visible browser action: `https://github.com/vercel-labs/agent-browser/issues/2146`.
- No customer claims, production benchmark, or security certification exists yet. Do not invent any.

## Product Principles

1. A claim is only as strong as the evidence that supports it.
2. Missing evidence is a visible state, never a silent pass.
3. Contracts express expectations; evidence records observations; the verifier makes the conclusion.
4. The live demo must exercise the same dynamic path as a judge's custom input.
5. Every result should be explainable without trusting an AI interpretation.

## Accessibility & Inclusion

The web console must support keyboard operation, visible focus, semantic form labels, readable contrast, reduced-motion-safe behavior, and errors that explain how to recover.
