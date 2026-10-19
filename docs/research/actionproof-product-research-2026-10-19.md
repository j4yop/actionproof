# ActionProof product research

**Date:** 2026-10-19  
**Question:** Is a deterministic wizard useful for ActionProof, and what else would make the product easier to use, easier to operate, and stronger for hackathon judges?  
**Research mode:** read-only web, YouTube transcript, GitHub repository, and project inspection using agent-reach plus the Matt Pocock engineering-skill setup flow.

## Executive decision

Build the deterministic wizard as a **thin, optional guided contract-authoring layer** over the existing verifier.

Do not make the wizard mandatory, do not remove expert JSON mode, and do not let it generate evidence. The wizard can help a user describe what should happen and compile that description into a validated ActionProof contract. Evidence must still come from an actual browser-agent run or collector.

The strongest product sequence is:

```text
Choose a scenario → define expected proof → define boundaries → review contract
→ load into the workbench → submit real evidence → inspect the verdict
```

The highest-value additions after the wizard are:

1. an adversarial scenario gallery;
2. an assertion-to-event evidence explorer;
3. portable, shareable verification receipts;
4. an import/export bundle and offline verification path;
5. a short judge mode that reaches a real PASS, then demonstrates a convincing failure.

## What was verified about the project

ActionProof already has the right core boundary:

- contract describes expectations;
- evidence records observations;
- the verifier makes the conclusion;
- missing, contradictory, or unsafe evidence fails closed;
- the verification kernel does not call a browser, model, remote artifact, or user code;
- fixture inputs use the same live API path as custom inputs.

The current usability gap is at the input boundary. The public console asks a first-time visitor to understand and author two large JSON documents before they can experience the product's value. That is an expert workflow presented as the default workflow.

## Project and Matt Pocock setup findings

- The repository is `j4yop/actionproof` on GitHub.
- GitHub Issues is the recommended issue tracker for the Matt Pocock engineering-skill setup and was confirmed for this repository.
- The repository has no root `AGENTS.md` or `CLAUDE.md`, no existing `GLOSSARY.md`, no `docs/agents/` configuration, and no ADR directory. The setup flow therefore needs a later choice of which agent-instruction file to create before it can write its durable configuration.
- No engineering or product code was changed during this research. This report is the only research artifact.

## Hackathon and judge evidence

The repository README identifies the target as **Developer Tools & Open Source**. The official OmniRush Frontier Buildathon page confirms the relevant qualitative criteria:

1. **It works:** the project does what the README says.
2. **It is worth using:** it solves a real problem clearly; small and polished beats big and broken.
3. **It rebuilds:** judges rebuild projects in Docker on clean Linux and run tests offline.
4. **OmniRush built it:** listed sessions should match the code.
5. **Best Use of OmniRush:** clear sessions, smart sub-agent use, tests, and clean rebuildability.

The same official page recommends a 2–3 minute demo video and a live link where applicable. That favors a feature that shortens the path from “I do not know this schema” to “I just saw the verifier catch a false success.”

**Implication:** the wizard is valuable if it improves time-to-first-verdict and makes the trust model visible. It is not valuable if it becomes a large form that hides the verifier or adds a second, unrelated data model.

Source: [OmniRush Frontier Buildathon 2026](https://omnirush.ai/buildathon)

## User perspective

### The problem with the current default

A new user must infer all of the following from raw JSON:

- what an assertion is;
- which event type to choose;
- how `where` paths map to event payloads;
- what evidence coverage means;
- how scope and forbidden capabilities affect the verdict;
- why evidence cannot be invented from a claim or screenshot.

That is too much cognitive load before the first successful interaction.

### What the wizard should do

The wizard should ask small, meaningful questions in plain language and progressively disclose advanced controls:

1. **Choose the goal** — for example, checkout, form submission, navigation, data extraction, or account change.
2. **Define what must happen** — event type, expected values, required/optional, and ordering.
3. **Define what must not happen** — unsafe evaluation, direct database write, wrong origin, disabled-control bypass, or unapproved capability.
4. **Define boundaries** — allowed origin, agent/workflow identity, duration, and evidence completeness.
5. **Review the contract** — plain-language summary, generated JSON, validation state, and per-answer Change controls.
6. **Load the contract** — send it into the existing workbench without generating or fabricating evidence.

The raw JSON editor should remain visible as **Expert mode**. Users should be able to switch between guided answers and JSON without losing work.

### Evidence that supports this interaction

- The USWDS complex-form pattern recommends progressive disclosure, small meaningful chunks, visible progress, actionable validation, and save/resume support. It specifically warns against hiding critical context.
- W3C recommends logical grouping, explicit progress, skippable optional stages, and preserving data when users review completed steps.
- GOV.UK's check-answers pattern recommends a final summary with a Change action beside each answer, so users can correct a specific choice without restarting the flow.

Sources:

- [USWDS: Progress easily](https://designsystem.digital.gov/patterns/complete-a-complex-form/progress-easily/)
- [W3C WAI: Multi-page forms](https://www.w3.org/WAI/tutorials/forms/multi-page/)
- [GOV.UK Design System: Check answers](https://design-system.service.gov.uk/patterns/check-answers/)

## Judge perspective

The wizard helps judges in three ways:

1. It makes the product understandable without requiring them to reverse-engineer a schema.
2. It makes the live demo interactive instead of fixture-only.
3. It demonstrates that ActionProof has a real contract model rather than a hard-coded set of verdict screens.

The judge path should be short and deterministic:

```text
Why: browser agents can claim success without proving the action.
How: contract → evidence → deterministic verifier.
What: PASS → unsafe bypass → INCONCLUSIVE, each linked to decisive evidence.
```

This follows the practical lesson from the reviewed hackathon-pitch transcripts: judges already know the broad problem category; the demo should show the entrant's interpretation of the problem and the product solving it, not restate a generic problem statement.

Sources:

- [How to Pitch at Hackathons](https://www.youtube.com/watch?v=k00WsEPDmrU)
- [How to win a hackathon](https://www.youtube.com/watch?v=MPfOhJs-EKc)
- [Galileo: Agentic Evaluations in Action](https://www.youtube.com/watch?v=QvStk5G8BZw)

## Recommended feature roadmap

### P0 — ship before adding breadth

#### 1. Scenario-first deterministic wizard

**User value:** creates a valid contract without JSON knowledge.  
**Judge value:** proves the tool is usable and data-driven.  
**Implementation shape:** a local React state machine that compiles to the existing contract schema; no network call and no model dependency.

#### 2. Adversarial scenario gallery

Keep the verified checkout fixture, but add clearly labeled scenarios:

- UI drift: expected checkout, observed cart;
- missing evidence: partial capture cannot prove success;
- false success: confirmation text appears, expected network request is absent;
- disabled-control bypass: successful-looking action plus forbidden DOM/capability event;
- wrong origin;
- duplicate submission;
- out-of-order confirmation;
- hash mismatch;
- hidden-tab click with no observable handler event;
- explicit policy block.

Every scenario must run through the same `/api/verify` path. A scenario is an input preset, never a precomputed verdict.

#### 3. Evidence explorer

Replace a passive assertion list with a two-way inspection model:

- select an assertion → highlight linked events;
- select an event → highlight affected assertions;
- show sequence, actor, collector, timestamp, payload, and integrity state;
- filter decisive evidence, unsafe events, missing events, policy blocks, and event types;
- show explicit coverage gaps.

The visual model should borrow the interaction grammar of Playwright Trace Viewer without importing Playwright's trust assumptions.

#### 4. Portable receipt

After a verdict, provide:

- copy verification ID;
- download receipt JSON;
- download the contract and evidence bundle;
- download a human-readable HTML receipt;
- copy hashes and verifier profile version;
- a stable self-contained link or content-addressed artifact where feasible.

The receipt should remain useful after the current browser tab is closed.

### P1 — strengthen adoption and rebuildability

#### 5. Import/export bundle

Support a versioned folder or zip containing:

```text
manifest.json
contract.json
receipt.json
artifacts/
```

The manifest should declare schema version, contract/evidence hashes, verifier/profile version, and artifact inventory. No silent coercion or best-effort repair.

#### 6. Offline verification command

Expose the pure domain verifier through a documented CLI or self-contained offline page. The page should state exactly what is verified: the supplied contract, evidence, receipt, and verifier profile — not the entire external world or an untrusted collector.

#### 7. Accessibility hardening

- error summary linking to invalid fields;
- live announcements for verification started/completed;
- visible keyboard focus;
- status meaning expressed in text as well as color;
- preserved malformed input;
- keyboard-operable wizard navigation and assertion expansion.

Sources:

- [W3C WAI: Form labels](https://www.w3.org/WAI/tutorials/forms/labels/)
- [W3C WAI: Form notifications](https://www.w3.org/WAI/tutorials/forms/notifications/)
- [WCAG: Error identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html)
- [WCAG: Focus visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
- [WCAG: Status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)

## Comparable projects and borrowed lessons

### Direct comparables

- [OpenEval](https://github.com/Hona/openeval) — typed criteria, deterministic judges, immutable recordings, evidence citations, calibration examples, and an evidence viewer. Borrow criterion-to-source drilldown; do not replace ActionProof's deterministic kernel with an LLM judge.
- [Browser Agent Eval](https://github.com/ingijy/browser-agent-eval) — independent final-state verification, inspectable trajectories, rejected versus executed actions, and negative cases. Borrow the “agent cannot award itself PASS” framing.
- [BrowserGym](https://github.com/ServiceNow/BrowserGym) — task contracts, benchmark namespaces, environment metadata, and extensible adapters. Borrow a stable scenario/adapter boundary, not its browser runtime.
- [WebArena](https://github.com/web-arena-x/webarena) — reproducible environments, task IDs, initial-state/reset metadata, and realistic multi-site scenarios. Borrow scenario manifests and environment declarations.
- [AgentDojo](https://github.com/ethz-spylab/agentdojo) — task, attack, defense, and pipeline separation. Borrow adversarial scenario structure and explicit unsafe outcomes.
- [OSWorld](https://github.com/xlang-ai/OSWorld) — rich evidence packages, manual review, environment/provider metadata, and verified result artifacts. Borrow optional artifact references without letting screenshots override structured evidence.

### Adjacent references

- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer) — before/action/after snapshots, timeline, action duration, console/network logs, metadata, and attachments. Borrow the evidence exploration grammar.
- [Vercel agent-browser](https://github.com/vercel-labs/agent-browser) — semantic actions, stable element references, network/HAR inspection, and explicit untrusted-page cues. Borrow guided action vocabulary and untrusted-origin messaging.
- [Open Policy Agent](https://github.com/open-policy-agent/opa) — structured input, declarative policy, structured decision, and a playground. Borrow guided assertion templates, not arbitrary user policy code.
- [in-toto](https://github.com/in-toto/in-toto) — versioned layouts, authorized actors, step attestations, expirations, and chained evidence. Borrow provenance vocabulary while preserving ActionProof's fail-closed trust distinction.

## Evidence-based product principles

1. **Reduce input complexity, not proof standards.** A wizard should make contracts easier to author, never make evidence easier to fake.
2. **One source of truth.** Wizard output, fixture input, imported JSON, and expert edits must all use the same contract schema and `/api/verify` path.
3. **Show the judge the failure.** A convincing unsafe or incomplete run is more differentiating than another green happy path.
4. **Make every verdict inspectable.** Every status should lead to the exact reason code and event evidence that caused it.
5. **Preserve expert escape hatches.** JSON editor, raw receipt, export, and offline verification must remain available.
6. **Keep the kernel boring and the experience clear.** The wizard and explorer are access layers around a deterministic core.

## Success criteria for the wizard

Before calling the feature complete, test these user-visible outcomes:

- A first-time user can create a schema-valid contract without reading the README.
- A user can navigate backward and change one answer without losing later answers unexpectedly.
- The generated JSON is visible, editable, and explicitly labeled as a contract draft.
- The wizard never creates or implies trustworthy evidence.
- Expert mode remains reachable from the first screen.
- Wizard-generated and hand-authored contracts produce the same verifier result for the same evidence.
- A judge can reach one PASS and one adversarial non-PASS in a short demo, then open the decisive event.
- The app remains buildable and testable offline with no new runtime provider or credential.

## Final recommendation

Proceed with the deterministic wizard first. It is useful for both users and judges, fits the existing no-browser/no-LLM product boundary, and directly supports the hackathon's “works,” “worth using,” and “rebuilds” criteria.

Do not add natural-language-to-evidence conversion. That would undermine the central product promise by allowing a claim to manufacture its own proof.

Do not build every roadmap item before judging. The highest-leverage sequence is:

1. wizard;
2. adversarial gallery;
3. evidence explorer;
4. portable receipt.
