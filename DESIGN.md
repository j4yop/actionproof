# ActionProof design system

## Design intent

ActionProof is an operational evidence console for developers and judges. The interface should feel like a proof ledger: calm enough for technical inspection, distinct enough to remember, and never more decorative than the verification task allows.

## Visual world

- **Surface:** cool paper-grey ground with white ledger sheets, ink-blue text, and ruled boundaries.
- **Accent:** cobalt for actions, links, verified structure, and the primary proof path.
- **Semantic colors:** green for pass, amber for drift and uncertainty, blue for blocked/information, red for unsafe/error.
- **Type:** precise sans for interface copy; monospace only for JSON, IDs, hashes, reason codes, and measurements.
- **Geometry:** crisp rectangular controls, square corners, and a single offset elevation used for evidence sheets.
- **Depth:** paper-on-desk separation through one restrained shadow language; no glass, gradients, glow, or decorative card nesting.
- **Hierarchy:** the proof task leads: contract and evidence are the material, the verdict is the report, and labels stay subordinate.

## Interaction language

- The main task is always visible: contract → evidence → verify → verdict.
- Fixtures are input presets, never precomputed verdicts.
- A result becomes visibly stale when the inputs change after verification.
- Assertion rows expand to show expected values, observed values, linked event IDs, and compact evidence excerpts.
- Copy actions exist for verification IDs and hashes.
- Loading, invalid input, incomplete evidence, blocked, unsafe, and unverified provenance are explicit states.
- Reduced motion preserves the state transition without requiring animation.

## Layout behavior

- Desktop uses an asymmetric split workbench: editors on the left, result on the right.
- The opening orientation is compact and points directly to the workbench; it is not a marketing landing page.
- The first viewport reads as a proof desk rather than a terminal: two documents enter on the left, a verdict report waits on the right.
- On narrow screens, inputs stack before the result and the verify action stays full-width and adjacent to the editors.
- Critical metadata remains readable at mobile sizes and is not communicated by color alone.

## Content rules

- Prefer plain, evidence-first language over marketing claims.
- Explain why a verdict occurred, not only what color it has.
- Never imply that unverified evidence is cryptographically trusted.
- Keep the user-facing promise aligned with the deterministic, no-browser, no-LLM runtime boundary.
