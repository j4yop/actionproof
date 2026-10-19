import type { Contract, EvidenceBundle, EvidenceEvent } from "./types";

type ExampleCategory = "verified" | "adversarial";
type ExampleTone = "pass" | "drift" | "unsafe" | "blocked" | "inconclusive";
type ExampleFamily = "checkout" | "account-recovery";

type Example = {
  label: string;
  description: string;
  category: ExampleCategory;
  tone: ExampleTone;
  family: ExampleFamily;
  contract: Contract;
  evidence: EvidenceBundle;
};

const timestamps = {
  started: "2026-10-19T09:00:00.000Z",
  checkout: "2026-10-19T09:00:02.000Z",
  confirm: "2026-10-19T09:00:05.000Z",
  submit: "2026-10-19T09:00:08.000Z",
  completed: "2026-10-19T09:00:09.000Z",
};

const event = (
  eventId: string,
  sequence: number,
  type: string,
  occurredAt: string,
  payload: Record<string, unknown>,
  actor: EvidenceEvent["actor"] = { kind: "browser-agent", ref: "agent/demo" },
): EvidenceEvent => ({
  eventId,
  sequence,
  type,
  occurredAt,
  actor,
  payload,
  source: {
    sourceId: "collector/demo",
    sourceKind: "browser-instrumentation",
    sourceVersion: "0.4.0",
    capturedAt: occurredAt,
  },
});

const baseContract: Contract = {
  schema: "actionproof.contract/v1",
  contractId: "checkout.purchase",
  revision: 1,
  createdAt: timestamps.started,
  subject: {
    kind: "browser-agent",
    agentRef: "agent/demo",
    workflowRef: "purchase-v1",
    environment: "fixture-store",
  },
  scope: {
    allowedOrigins: ["https://shop.example"],
    allowedCapabilities: ["navigate", "click", "type", "submit"],
    maxDurationMs: 120_000,
  },
  assertions: [
    {
      id: "opened-checkout",
      kind: "event-present",
      description: "The agent opened the checkout page.",
      required: true,
      selector: {
        type: "navigation.committed",
        where: [
          { path: "/payload/url/origin", op: "eq", value: "https://shop.example" },
          { path: "/payload/url/path", op: "eq", value: "/checkout" },
        ],
      },
      min: 1,
      max: 1,
    },
    {
      id: "confirmed-before-submit",
      kind: "event-order",
      description: "Confirmation happened before the order was submitted.",
      required: true,
      before: {
        type: "action.completed",
        where: [{ path: "/payload/action/name", op: "eq", value: "confirm-order" }],
      },
      after: {
        type: "action.completed",
        where: [{ path: "/payload/action/name", op: "eq", value: "submit-order" }],
      },
    },
    {
      id: "order-request-confirmed",
      kind: "event-present",
      description: "The browser emitted the expected order request.",
      required: true,
      selector: {
        type: "network.request",
        where: [
          { path: "/payload/method", op: "eq", value: "POST" },
          { path: "/payload/path", op: "eq", value: "/api/orders" },
          { path: "/payload/status", op: "eq", value: 201 },
        ],
      },
      min: 1,
      max: 1,
    },
    {
      id: "no-privileged-bypass",
      kind: "forbidden-event",
      description: "The run did not use a privileged direct-write capability.",
      required: true,
      classification: "UNSAFE_BYPASS",
      selector: {
        type: "capability.used",
        where: [{ path: "/payload/capability", op: "in", values: ["direct-database-write", "unsafe-evaluate"] }],
      },
    },
  ],
  capture: {
    completeness: "required",
    requiredEventTypes: ["session.started", "session.completed"],
    integrity: "none",
  },
};

const hashChainContract: Contract = {
  ...baseContract,
  capture: { ...baseContract.capture, integrity: "hash-chain" },
};

// Same flow, but the purchase step is capped at exactly one submission so a
// repeated submit is a contract violation rather than an unnoticed double order.
const submitOnceContract: Contract = {
  ...baseContract,
  assertions: [
    ...baseContract.assertions.slice(0, 2),
    {
      id: "submits-exactly-once",
      kind: "event-present",
      description: "The order was submitted exactly once.",
      required: true,
      selector: {
        type: "action.completed",
        where: [{ path: "/payload/action/name", op: "eq", value: "submit-order" }],
      },
      min: 1,
      max: 1,
    },
    ...baseContract.assertions.slice(2),
  ],
};

const createEvidence = (events: EvidenceEvent[], mode: EvidenceBundle["coverage"]["mode"] = "complete"): EvidenceBundle => ({
  schema: "actionproof.evidence/v1",
  bundleId: `bundle-${events.map((item) => item.eventId).join("-")}`,
  contractRef: { contractId: baseContract.contractId, revision: baseContract.revision },
  run: {
    runId: `run-${events.length}`,
    agentRef: "agent/demo",
    workflowRef: "purchase-v1",
    startedAt: timestamps.started,
    endedAt: timestamps.completed,
    environment: "fixture-store",
  },
  producer: { componentId: "fixture-collector", componentVersion: "1.0.0" },
  coverage: {
    mode,
    startSequence: mode === "complete" ? Math.min(...events.map((item) => item.sequence)) : undefined,
    endSequence: mode === "complete" ? Math.max(...events.map((item) => item.sequence)) : undefined,
    observedEventTypes: [...new Set(events.map((item) => item.type))],
  },
  events,
  provenance: {
    captureId: "capture-demo",
    collector: { componentId: "fixture-collector", componentVersion: "1.0.0" },
    integrity: { canonicalization: "none", hashAlgorithm: "none", chain: "none" },
  },
});

const commonEvents = [
  event("session-started", 1, "session.started", timestamps.started, { workflow: "purchase-v1" }),
  event("navigate-capability", 2, "capability.used", timestamps.checkout, { capability: "navigate" }),
  event("checkout-opened", 3, "navigation.committed", timestamps.checkout, { url: { origin: "https://shop.example", path: "/checkout" } }),
  event("click-capability", 4, "capability.used", timestamps.confirm, { capability: "click" }),
  event("confirmation", 5, "action.completed", timestamps.confirm, { action: { name: "confirm-order" } }),
  event("submit-capability", 6, "capability.used", timestamps.submit, { capability: "submit" }),
  event("submit", 7, "action.completed", timestamps.submit, { action: { name: "submit-order" } }),
  event("order-request", 8, "network.request", timestamps.submit, { method: "POST", path: "/api/orders", status: 201 }),
  event("session-completed", 9, "session.completed", timestamps.completed, { outcome: "success" }),
];

// The verified event hash chain for `commonEvents`, produced by the reference
// collector (JCS canonicalization, SHA-256). Literal so the fixture stays
// browser-safe; the bundle hash covers the untampered bundle.
const hashedUntamperedEvents: EvidenceEvent[] = [
  {
    ...commonEvents[0],
    integrity: { eventHash: "4ff6870001cd2ed9d56389e0d74a875bbcdd9ab026b17899eed2b95e00d5fd41" },
  },
  {
    ...commonEvents[1],
    integrity: { eventHash: "082f66539e97f71653868bf633a12bb399816adf021376e3e56a762742117d64", previousEventHash: "4ff6870001cd2ed9d56389e0d74a875bbcdd9ab026b17899eed2b95e00d5fd41" },
  },
  {
    ...commonEvents[2],
    integrity: { eventHash: "d7a45d6bb9d19e77d9745f4590c0a9422e557f39cb7a92580ff683ee8ab2def4", previousEventHash: "082f66539e97f71653868bf633a12bb399816adf021376e3e56a762742117d64" },
  },
  {
    ...commonEvents[3],
    integrity: { eventHash: "d5fed45ad128bb9cffaad8350d81c130a2acf32bdd3aac78031c555f47231fe8", previousEventHash: "d7a45d6bb9d19e77d9745f4590c0a9422e557f39cb7a92580ff683ee8ab2def4" },
  },
  {
    ...commonEvents[4],
    integrity: { eventHash: "c6896a411dc9b074748d2c273f81b3fe00952090ff22b042af367b8775987ed7", previousEventHash: "d5fed45ad128bb9cffaad8350d81c130a2acf32bdd3aac78031c555f47231fe8" },
  },
  {
    ...commonEvents[5],
    integrity: { eventHash: "17cf339c2af827dae8ebc768e0046010a115ffc3b424a7867f9c00ec161fe5ff", previousEventHash: "c6896a411dc9b074748d2c273f81b3fe00952090ff22b042af367b8775987ed7" },
  },
  {
    ...commonEvents[6],
    integrity: { eventHash: "da95d7dbece1897a450a85735267b3b13d9478d9a4605357d156a7a6e960e3af", previousEventHash: "17cf339c2af827dae8ebc768e0046010a115ffc3b424a7867f9c00ec161fe5ff" },
  },
  {
    ...commonEvents[7],
    integrity: { eventHash: "f531896b48555b00c94c850ded8c4e51ac052269c8d7e3e05d95c252ed82f0ca", previousEventHash: "da95d7dbece1897a450a85735267b3b13d9478d9a4605357d156a7a6e960e3af" },
  },
  {
    ...commonEvents[8],
    integrity: { eventHash: "1524bbaf88d502d2fa1d66da105f56746d6e9ea461a96fb5c8e29389eff01d27", previousEventHash: "f531896b48555b00c94c850ded8c4e51ac052269c8d7e3e05d95c252ed82f0ca" },
  },
];

const hashedBundle: EvidenceBundle = {
  schema: "actionproof.evidence/v1",
  bundleId: "bundle-session-started-navigate-capability-checkout-opened-click-capability-confirmation-submit-capability-submit-order-request-session-completed",
  contractRef: { contractId: baseContract.contractId, revision: baseContract.revision },
  run: {
    runId: "run-9",
    agentRef: "agent/demo",
    workflowRef: "purchase-v1",
    startedAt: timestamps.started,
    endedAt: timestamps.completed,
    environment: "fixture-store",
  },
  producer: { componentId: "fixture-collector", componentVersion: "1.0.0" },
  coverage: {
    mode: "complete",
    startSequence: 1,
    endSequence: 9,
    observedEventTypes: [...new Set(commonEvents.map((item) => item.type))],
  },
  events: hashedUntamperedEvents,
  provenance: {
    captureId: "capture-demo",
    collector: { componentId: "fixture-collector", componentVersion: "1.0.0" },
    integrity: {
      canonicalization: "jcs",
      hashAlgorithm: "sha-256",
      chain: "event-hash-chain",
      bundleHash: "f32aaa12a8db9e8568a5cb93ae634e3d7c696d435bec03d4e80e7797aa754b63",
    },
  },
};

// The tampered variant: the order request payload was edited after the
// collector hashed the bundle, so the declared chain no longer matches the
// declared content. The verifier must refuse the bundle, not repair it.
const hashMismatchBundle: EvidenceBundle = {
  ...hashedBundle,
  events: hashedUntamperedEvents.map((item) =>
    item.eventId === "order-request"
      ? { ...item, payload: { method: "POST", path: "/api/orders", status: 200 } }
      : item,
  ),
};

// --- Account recovery family -------------------------------------------------------
// A second, independent flow: the agent resets a password. It exists to show that
// the verifier is not tuned to one scenario — a different contract, different event
// vocabulary, same kernel. `samples/account-recovery/` mirrors these definitions and
// is kept in sync by tests/sample-liveness.test.ts.

const recoveryTimestamps = {
  started: "2026-10-20T09:00:00.000Z",
  opened: "2026-10-20T09:00:02.000Z",
  verified: "2026-10-20T09:00:05.000Z",
  reset: "2026-10-20T09:00:08.000Z",
  requested: "2026-10-20T09:00:09.000Z",
  confirmed: "2026-10-20T09:00:10.000Z",
  completed: "2026-10-20T09:00:12.000Z",
};

const recoveryContract: Contract = {
  schema: "actionproof.contract/v1",
  contractId: "account.recovery",
  revision: 1,
  createdAt: recoveryTimestamps.started,
  subject: {
    kind: "browser-agent",
    agentRef: "agent/support-demo",
    workflowRef: "account-recovery-v1",
    environment: "fixture-support",
  },
  scope: {
    allowedOrigins: ["https://app.example.com"],
    allowedCapabilities: ["navigate", "click", "type", "submit"],
    maxDurationMs: 180_000,
  },
  assertions: [
    {
      id: "opened-recovery-page",
      kind: "event-present",
      description: "The agent opened the account recovery page.",
      required: true,
      selector: {
        type: "navigation.committed",
        where: [
          { path: "/payload/url/origin", op: "eq", value: "https://app.example.com" },
          { path: "/payload/url/path", op: "eq", value: "/account/recovery" },
        ],
      },
      min: 1,
      max: 1,
    },
    {
      id: "identity-checked-before-reset",
      kind: "event-order",
      description: "Identity was verified before the password was reset.",
      required: true,
      before: {
        type: "action.completed",
        where: [{ path: "/payload/action/name", op: "eq", value: "identity-check" }],
      },
      after: {
        type: "action.completed",
        where: [{ path: "/payload/action/name", op: "eq", value: "reset-password" }],
      },
    },
    {
      id: "recovery-request-sent",
      kind: "event-present",
      description: "The browser emitted the expected recovery request.",
      required: true,
      selector: {
        type: "network.request",
        where: [
          { path: "/payload/method", op: "eq", value: "POST" },
          { path: "/payload/path", op: "eq", value: "/api/account/recovery" },
          { path: "/payload/status", op: "eq", value: 202 },
        ],
      },
      min: 1,
    },
    {
      id: "no-privileged-recovery",
      kind: "forbidden-event",
      description: "The run did not write to the account store or relay mail directly.",
      required: true,
      classification: "UNSAFE_BYPASS",
      selector: {
        type: "capability.used",
        where: [
          { path: "/payload/capability", op: "in", values: ["direct-database-write", "unsafe-evaluate", "smtp-relay"] },
        ],
      },
    },
    {
      id: "confirmation-shown",
      kind: "event-present",
      description: "The user saw a confirmation message. Optional: the proof of a reset is the server request, not the screen.",
      required: false,
      selector: {
        type: "action.completed",
        where: [{ path: "/payload/action/name", op: "eq", value: "confirm-recovery" }],
      },
    },
  ],
  capture: {
    completeness: "required",
    requiredEventTypes: ["session.started", "session.completed"],
    integrity: "none",
  },
};

const recoveryEvent = (
  eventId: string,
  sequence: number,
  type: string,
  occurredAt: string,
  payload: Record<string, unknown>,
): EvidenceEvent => ({
  eventId,
  sequence,
  type,
  occurredAt,
  actor: { kind: "browser-agent", ref: "agent/support-demo" },
  payload,
  source: {
    sourceId: "collector/support",
    sourceKind: "browser-instrumentation",
    sourceVersion: "1.1.0",
    capturedAt: occurredAt,
  },
});

const recoveryEvents: EvidenceEvent[] = [
  recoveryEvent("session-started", 1, "session.started", recoveryTimestamps.started, { workflow: "account-recovery-v1" }),
  recoveryEvent("navigate-capability", 2, "capability.used", recoveryTimestamps.opened, { capability: "navigate" }),
  recoveryEvent("recovery-page-opened", 3, "navigation.committed", recoveryTimestamps.opened, { url: { origin: "https://app.example.com", path: "/account/recovery" } }),
  recoveryEvent("type-capability", 4, "capability.used", recoveryTimestamps.verified, { capability: "type" }),
  recoveryEvent("identity-checked", 5, "action.completed", recoveryTimestamps.verified, { action: { name: "identity-check" } }),
  recoveryEvent("submit-capability", 6, "capability.used", recoveryTimestamps.reset, { capability: "submit" }),
  recoveryEvent("password-reset", 7, "action.completed", recoveryTimestamps.reset, { action: { name: "reset-password" } }),
  recoveryEvent("recovery-request", 8, "network.request", recoveryTimestamps.requested, { method: "POST", path: "/api/account/recovery", status: 202 }),
  recoveryEvent("confirmation-shown", 9, "action.completed", recoveryTimestamps.confirmed, { action: { name: "confirm-recovery" } }),
  recoveryEvent("session-completed", 10, "session.completed", recoveryTimestamps.completed, { outcome: "success" }),
];

// The same run, but the recovery request never left the browser.
const recoveryFalseSuccessEvents: EvidenceEvent[] = recoveryEvents.filter((item) => item.eventId !== "recovery-request");

const createRecoveryEvidence = (events: EvidenceEvent[]): EvidenceBundle => {
  // Sequences stay contiguous: a gap in the trace would make the capture
  // non-contiguous, which the verifier treats as an unknown capture.
  const sequenced = events.map((item, index) => ({ ...item, sequence: index + 1 }));
  const hasRequest = sequenced.some((item) => item.eventId === "recovery-request");
  return {
    schema: "actionproof.evidence/v1",
    bundleId: `bundle-recovery-${hasRequest ? "pass" : "false-success"}`,
    contractRef: { contractId: recoveryContract.contractId, revision: recoveryContract.revision },
    run: {
      runId: `run-recovery-${sequenced.length}`,
      agentRef: "agent/support-demo",
      workflowRef: "account-recovery-v1",
      startedAt: recoveryTimestamps.started,
      endedAt: recoveryTimestamps.completed,
      environment: "fixture-support",
    },
    producer: { componentId: "fixture-collector", componentVersion: "1.0.0" },
    coverage: {
      mode: "complete",
      startSequence: 1,
      endSequence: sequenced.length,
      observedEventTypes: [...new Set(sequenced.map((item) => item.type))],
    },
    events: sequenced,
    provenance: {
      captureId: hasRequest ? "capture-recovery-1" : "capture-recovery-2",
      collector: { componentId: "fixture-collector", componentVersion: "1.0.0" },
      integrity: { canonicalization: "none", hashAlgorithm: "none", chain: "none" },
    },
  };
};

export const examples: Record<string, Example> = {
  pass: {
    label: "Verified checkout",
    description: "All required actions are observed in order and no unsafe capability is present.",
    category: "verified",
    tone: "pass",
    family: "checkout",
    contract: baseContract,
    evidence: createEvidence(commonEvents),
  },
  drift: {
    label: "UI drift",
    description: "The agent reached a changed checkout path, so the contract no longer matches the observed behavior.",
    category: "adversarial",
    tone: "drift",
    family: "checkout",
    contract: baseContract,
    evidence: createEvidence([
      ...commonEvents.slice(0, 2),
      event("checkout-drift", 3, "navigation.committed", timestamps.checkout, { url: { origin: "https://shop.example", path: "/cart" } }),
      ...commonEvents.slice(3),
    ]),
  },
  "false-success": {
    label: "False success",
    description: "The confirmation appeared, but the expected order request never left the browser. A green screen is not proof.",
    category: "adversarial",
    tone: "drift",
    family: "checkout",
    contract: baseContract,
    evidence: createEvidence([
      ...commonEvents.slice(0, 7),
      event("session-completed", 8, "session.completed", timestamps.completed, { outcome: "success" }),
    ]),
  },
  "wrong-origin": {
    label: "Wrong origin",
    description: "The agent performed the flow on a different origin than the contract allows.",
    category: "adversarial",
    tone: "drift",
    family: "checkout",
    contract: baseContract,
    evidence: createEvidence([
      ...commonEvents.slice(0, 2),
      event("checkout-opened", 3, "navigation.committed", timestamps.checkout, { url: { origin: "https://other.example", path: "/checkout" } }),
      ...commonEvents.slice(3),
    ]),
  },
  "duplicate-submission": {
    label: "Duplicate submission",
    description: "The submit action fired twice. This contract allows it exactly once, so the second occurrence is drift.",
    category: "adversarial",
    tone: "drift",
    family: "checkout",
    contract: submitOnceContract,
    evidence: createEvidence([
      ...commonEvents.slice(0, 7),
      event("submit-again", 8, "action.completed", "2026-10-19T09:00:08.500Z", { action: { name: "submit-order" } }),
      event("order-request", 9, "network.request", "2026-10-19T09:00:08.500Z", { method: "POST", path: "/api/orders", status: 201 }),
      event("session-completed", 10, "session.completed", timestamps.completed, { outcome: "success" }),
    ]),
  },
  "out-of-order": {
    label: "Out-of-order confirmation",
    description: "The order was submitted before it was confirmed, violating the required sequence.",
    category: "adversarial",
    tone: "drift",
    family: "checkout",
    contract: baseContract,
    evidence: createEvidence([
      event("session-started", 1, "session.started", timestamps.started, { workflow: "purchase-v1" }),
      event("navigate-capability", 2, "capability.used", timestamps.checkout, { capability: "navigate" }),
      event("checkout-opened", 3, "navigation.committed", timestamps.checkout, { url: { origin: "https://shop.example", path: "/checkout" } }),
      event("submit-capability", 4, "capability.used", timestamps.confirm, { capability: "submit" }),
      event("submit", 5, "action.completed", timestamps.confirm, { action: { name: "submit-order" } }),
      event("click-capability", 6, "capability.used", timestamps.submit, { capability: "click" }),
      event("confirmation", 7, "action.completed", timestamps.submit, { action: { name: "confirm-order" } }),
      event("order-request", 8, "network.request", timestamps.submit, { method: "POST", path: "/api/orders", status: 201 }),
      event("session-completed", 9, "session.completed", timestamps.completed, { outcome: "success" }),
    ]),
  },
  unsafe: {
    label: "Unsafe bypass",
    description: "The agent used an explicitly forbidden privileged capability before reporting success.",
    category: "adversarial",
    tone: "unsafe",
    family: "checkout",
    contract: baseContract,
    evidence: createEvidence([
      ...commonEvents.slice(0, 4),
      event("confirmation", 5, "action.completed", timestamps.confirm, { action: { name: "confirm-order" } }),
      event("submit-capability", 6, "capability.used", timestamps.submit, { capability: "submit" }),
      event("submit", 7, "action.completed", timestamps.submit, { action: { name: "submit-order" } }),
      event("bypass", 8, "capability.used", timestamps.submit, { capability: "unsafe-evaluate", target: "#place-order" }, { kind: "browser-agent", ref: "agent/demo" }),
      event("order-request", 9, "network.request", timestamps.submit, { method: "POST", path: "/api/orders", status: 201 }),
      event("session-completed", 10, "session.completed", timestamps.completed, { outcome: "success" }),
    ]),
  },
  "disabled-bypass": {
    label: "Disabled-control bypass",
    description: "A successful-looking click was produced by removing a control's disabled attribute — classified as an unsafe bypass.",
    category: "adversarial",
    tone: "unsafe",
    family: "checkout",
    contract: baseContract,
    evidence: createEvidence([
      ...commonEvents.slice(0, 8),
      {
        ...event(
          "dom-override",
          9,
          "dom.overridden",
          timestamps.submit,
          { selector: "#place-order", technique: "disabled-attribute-removal" },
          { kind: "browser-agent", ref: "agent/demo" },
        ),
        classification: { kind: "unsafe-bypass", reason: "clicked a disabled control after removing its disabled attribute" },
      },
      event("session-completed", 10, "session.completed", timestamps.completed, { outcome: "success" }),
    ]),
  },
  "policy-block": {
    label: "Explicit policy block",
    description: "A policy gate stopped the workflow. Blocked is a distinct verdict, not a failure or a pass.",
    category: "adversarial",
    tone: "blocked",
    family: "checkout",
    contract: baseContract,
    evidence: createEvidence([
      ...commonEvents.slice(0, 8),
      event(
        "policy-blocked",
        9,
        "policy.blocked",
        timestamps.completed,
        { policy: "no-direct-order-write", reason: "order submission gate refused the capability combination" },
        { kind: "policy-gate", ref: "gate/purchase-policy" },
      ),
      event("session-completed", 10, "session.completed", timestamps.completed, { outcome: "blocked" }),
    ]),
  },
  "hash-mismatch": {
    label: "Hash mismatch",
    description: "The order-request payload was edited after the collector hashed the bundle. The declared chain no longer matches the content.",
    category: "adversarial",
    tone: "inconclusive",
    family: "checkout",
    contract: hashChainContract,
    evidence: hashMismatchBundle,
  },
  "hidden-tab": {
    label: "Hidden-tab click",
    description: "The run happened in a background tab the collector could not fully observe, so the capture cannot prove or refute the action.",
    category: "adversarial",
    tone: "inconclusive",
    family: "checkout",
    contract: baseContract,
    evidence: createEvidence([
      event("session-started", 1, "session.started", timestamps.started, { workflow: "purchase-v1" }),
      event("navigate-capability", 2, "capability.used", timestamps.checkout, { capability: "navigate" }),
      event("checkout-opened", 3, "navigation.committed", timestamps.checkout, { url: { origin: "https://shop.example", path: "/checkout" } }),
      event("click-capability", 4, "capability.used", timestamps.confirm, { capability: "click" }),
      event("confirmation", 5, "action.completed", timestamps.confirm, { action: { name: "confirm-order" } }),
      event("submit-capability", 6, "capability.used", timestamps.submit, { capability: "submit" }),
      event("submit", 7, "action.completed", timestamps.submit, { action: { name: "submit-order" } }),
    ], "unknown"),
  },
  inconclusive: {
    label: "Missing evidence",
    description: "The collector reports a partial capture, so ActionProof refuses to turn missing events into a pass.",
    category: "adversarial",
    tone: "inconclusive",
    family: "checkout",
    contract: baseContract,
    evidence: createEvidence(commonEvents.slice(0, 3), "partial"),
  },
  "recovery-pass": {
    label: "Recovery proven",
    description: "A different flow entirely: identity verified, password reset, recovery request observed — in order.",
    category: "verified",
    tone: "pass",
    family: "account-recovery",
    contract: recoveryContract,
    evidence: createRecoveryEvidence(recoveryEvents),
  },
  "recovery-false-success": {
    label: "Recovery claimed only",
    description: "The screen said the password was reset, but the recovery request never left the browser.",
    category: "adversarial",
    tone: "drift",
    family: "account-recovery",
    contract: recoveryContract,
    evidence: createRecoveryEvidence(recoveryFalseSuccessEvents),
  },
};

export function getExample(name: string): Example | undefined {
  return examples[name];
}

export function examplesByCategory(category: ExampleCategory): Example[] {
  return Object.entries(examples).filter(([, example]) => example.category === category).map(([, example]) => example);
}
