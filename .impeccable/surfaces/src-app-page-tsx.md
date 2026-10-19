---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

## Scope

The public ActionProof console is an operate surface for submitting a contract and evidence bundle, running a deterministic verification, and understanding the verdict without installing local tooling.

## Audience and job

Developers, reviewers, and buildathon judges bring structured JSON from a browser-agent run. Their job is to determine whether the run is supported by sufficient, policy-compliant evidence. The console must make the input boundary, verification action, and result evidence obvious within seconds.

## Direction contract

**THESIS:** Treat the console as a proof ledger: evidence enters as two structured documents, the verifier makes a bounded determination, and every conclusion points back to an observable event. Refuse both the chat-like AI assistant and dark terminal defaults.

**OWN-WORLD:** Cool paper-grey ground, white evidence sheets, ink-blue typography, cobalt actions, amber uncertainty, red safety violations, and green confirmation. Use a precise sans for interface copy and a mono face only for JSON, event IDs, hashes, reason codes, and measurements. Edges are crisp, corners are square, and depth comes from one paper-sheet shadow.

**STORY:** The visitor starts with the problem statement and two input documents. They can load an example or provide their own JSON, run the verifier, see a single verdict with confidence language, then walk through assertion results, event references, coverage, provenance, and the raw receipt. The UI teaches the trust boundary while it performs the task.

**FIRST VIEWPORT:** A compact top rail names ActionProof and shows the runtime promise: deterministic, offline-ready, no LLM. The opening is a proof desk: a large ink-blue statement and three short trust steps sit above a split input/result workbench. White contract and evidence sheets occupy the left; a quiet verdict report waits on the right. The cobalt Verify evidence button anchors the sheets, and the right report changes state without changing the page grammar.

**FORM:** Signal Ledger, a cool editorial evidence desk rather than a terminal. Its signature interaction is the verdict transition: the blank report becomes a stamped, color-coded, evidence-linked decision while the input sheets remain available for iteration.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
