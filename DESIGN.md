# ActionProof design system

## Design intent

ActionProof is an operational evidence console for developers and judges. The interface should feel like a calm forensic instrument: precise enough for technical inspection, legible enough for a first-time reviewer, and never more decorative than the verification task allows.

## Visual world

- **Surface:** one dark, cool near-black system with quiet elevation and ruled boundaries.
- **Accent:** restrained cyan for structure, actions, links, and verified navigation.
- **Semantic colors:** green for pass, amber for drift and uncertainty, blue for blocked/information, red for unsafe/error.
- **Type:** precise sans for interface copy; monospace only for JSON, IDs, hashes, reason codes, and measurements.
- **Geometry:** mostly crisp rectangles with a small, consistent radius vocabulary. Rules and alignment do the organizational work.
- **Depth:** one soft shadow language; no glass, gradients, glow, or decorative card nesting.
- **Hierarchy:** headings and the task controls carry the page; repeated kicker labels and decorative section numbering stay out of the way.

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
- On narrow screens, inputs stack before the result and the verify action stays full-width and adjacent to the editors.
- Critical metadata remains readable at mobile sizes and is not communicated by color alone.

## Content rules

- Prefer plain, evidence-first language over marketing claims.
- Explain why a verdict occurred, not only what color it has.
- Never imply that unverified evidence is cryptographically trusted.
- Keep the user-facing promise aligned with the deterministic, no-browser, no-LLM runtime boundary.
