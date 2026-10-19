import type { Contract, EvidenceBundle, EvidenceEvent } from "./types";

type Example = {
  label: string;
  description: string;
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

export const examples: Record<string, Example> = {
  pass: {
    label: "Verified checkout",
    description: "All required actions are observed in order and no unsafe capability is present.",
    contract: baseContract,
    evidence: createEvidence(commonEvents),
  },
  drift: {
    label: "UI drift",
    description: "The agent reached a changed checkout path, so the contract no longer matches the observed behavior.",
    contract: baseContract,
    evidence: createEvidence([
      ...commonEvents.slice(0, 2),
      event("checkout-drift", 3, "navigation.committed", timestamps.checkout, { url: { origin: "https://shop.example", path: "/cart" } }),
      ...commonEvents.slice(3),
    ]),
  },
  unsafe: {
    label: "Unsafe bypass",
    description: "The agent used an explicitly forbidden privileged capability before reporting success.",
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
  inconclusive: {
    label: "Missing evidence",
    description: "The collector reports a partial capture, so ActionProof refuses to turn missing events into a pass.",
    contract: baseContract,
    evidence: createEvidence(commonEvents.slice(0, 3), "partial"),
  },
};

export function getExample(name: string): Example | undefined {
  return examples[name];
}
