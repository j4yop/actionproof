## Scope

The public ActionProof console is an operate surface for submitting a contract and evidence bundle, running a deterministic verification, and understanding the verdict without installing local tooling.

## Audience and job

Developers, reviewers, and buildathon judges bring structured JSON from a browser-agent run. Their job is to determine whether the run is supported by sufficient, policy-compliant evidence. The console must make the input boundary, verification action, and result evidence obvious within seconds.

## Direction contract

**THESIS:** Treat the console as a forensic control room: evidence enters as structured material, the verifier makes a bounded determination, and every conclusion points back to an observable event. Refuse the category default of a chat-like AI assistant or decorative dashboard.

**OWN-WORLD:** Near-black instrument surfaces, cool blue-white text, restrained cyan for verified structure, amber for uncertainty, red for safety violations, and neutral ruled panels for evidence. Use a precise sans for interface copy and a mono face only for JSON, event IDs, hashes, and measurements. Edges are crisp; depth comes from one soft elevation system, not floating card stacks.

**STORY:** The visitor starts with the problem statement and two input documents. They can load an example or provide their own JSON, run the verifier, see a single verdict with confidence language, then walk through assertion results, event references, coverage, provenance, and the raw receipt. The UI teaches the trust boundary while it performs the task.

**FIRST VIEWPORT:** A compact top rail names ActionProof and shows the runtime promise: deterministic, offline-ready, no LLM. The main split is an input workbench on the left and a quiet “awaiting evidence” result well on the right. A clear Verify evidence button anchors the workbench. Once run, the right well becomes the verdict and assertion summary without changing page geometry.

**FORM:** Forensic control room, assigned as the operational visual direction for the greenfield console. Its signature interaction is the verdict transition: the result well changes from an empty evidence state to a color-coded, evidence-linked decision while the input panes remain available for iteration.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
