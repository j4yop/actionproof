export type Scalar = string | number | boolean | null;

export type Predicate =
  | {
      path: string;
      op: "eq" | "neq" | "lt" | "lte" | "gt" | "gte";
      value: unknown;
    }
  | {
      path: string;
      op: "in" | "notIn";
      values: unknown[];
    }
  | {
      path: string;
      op: "exists";
      value: boolean;
    };

export interface EventSelector {
  type: string;
  where?: Predicate[];
}

export interface AssertionBase {
  id: string;
  description?: string;
  required: boolean;
}

export type ContractAssertion =
  | (AssertionBase & {
      kind: "event-present";
      selector: EventSelector;
      min?: number;
      max?: number;
    })
  | (AssertionBase & {
      kind: "event-absent";
      selector: EventSelector;
    })
  | (AssertionBase & {
      kind: "event-order";
      before: EventSelector;
      after: EventSelector;
    })
  | (AssertionBase & {
      kind: "duration";
      start: EventSelector;
      end: EventSelector;
      minMs?: number;
      maxMs?: number;
    })
  | (AssertionBase & {
      kind: "forbidden-event";
      selector: EventSelector;
      classification: "UNSAFE_BYPASS";
    });

export interface Contract {
  schema: "actionproof.contract/v1";
  contractId: string;
  revision: number;
  createdAt: string;
  validFrom?: string;
  validUntil?: string;
  subject: {
    kind: "browser-agent";
    agentRef?: string;
    workflowRef?: string;
    environment?: string;
  };
  scope?: {
    allowedOrigins?: string[];
    allowedCapabilities?: string[];
    maxDurationMs?: number;
  };
  assertions: ContractAssertion[];
  capture: {
    completeness: "required" | "best-effort";
    requiredEventTypes?: string[];
    integrity: "none" | "hash-chain" | "signed";
  };
  metadata?: Record<string, string>;
}

export interface EvidenceEvent {
  eventId: string;
  sequence: number;
  type: string;
  occurredAt: string;
  actor: {
    kind: "browser-agent" | "browser" | "policy-gate" | "collector" | "operator" | "system";
    ref?: string;
  };
  payload: Record<string, unknown>;
  source: {
    sourceId: string;
    sourceKind: "agent-runtime" | "browser-instrumentation" | "policy-gate" | "collector" | "operator";
    sourceVersion: string;
    capturedAt: string;
    parentEventId?: string;
  };
  classification?: {
    kind: "observation" | "action-block" | "policy-block" | "unsafe-bypass";
    reason?: string;
    affectsAssertionIds?: string[];
  };
  integrity?: {
    eventHash: string;
    previousEventHash?: string;
  };
}

export interface EvidenceBundle {
  schema: "actionproof.evidence/v1";
  bundleId: string;
  contractRef: {
    contractId: string;
    revision: number;
  };
  run: {
    runId: string;
    agentRef?: string;
    workflowRef?: string;
    startedAt: string;
    endedAt?: string;
    environment?: string;
  };
  producer: {
    componentId: string;
    componentVersion: string;
  };
  coverage: {
    mode: "complete" | "partial" | "unknown";
    startSequence?: number;
    endSequence?: number;
    observedEventTypes: string[];
    gaps?: Array<{ fromSequence: number; toSequence: number; reason?: string }>;
  };
  events: EvidenceEvent[];
  artifacts?: EvidenceArtifact[];
  provenance: EvidenceProvenance;
  metadata?: Record<string, string>;
}

export interface EvidenceArtifact {
  artifactId: string;
  kind: "screenshot" | "dom-snapshot" | "network-log" | "console-log" | "other";
  mediaType: string;
  byteLength: number;
  sha256: string;
  storageRef: string;
  producedAt: string;
  relatedEventIds: string[];
}

export interface EvidenceProvenance {
  captureId: string;
  collector: {
    componentId: string;
    componentVersion: string;
  };
  transformations?: Array<{
    transformationId: string;
    kind: string;
    componentVersion: string;
    inputHash: string;
    outputHash: string;
    appliedAt: string;
  }>;
  integrity: {
    canonicalization: "none" | "jcs";
    hashAlgorithm: "none" | "sha-256";
    bundleHash?: string;
    chain: "none" | "event-hash-chain";
  };
  signature?: {
    algorithm: "ed25519";
    keyId: string;
    signedHash: string;
    signature: string;
  };
}

export type VerificationStatus = "PASS" | "DRIFT" | "BLOCKED" | "UNSAFE_BYPASS" | "INCONCLUSIVE";

export type AssertionStatus = "passed" | "failed" | "blocked" | "unsafe" | "not-evaluable";

export interface AssertionResult {
  assertionId: string;
  description?: string;
  kind: ContractAssertion["kind"];
  required: boolean;
  status: AssertionStatus;
  reasonCode: string;
  evidenceEventIds: string[];
  expected?: unknown;
  observed?: unknown;
}

export interface VerificationResult {
  schema: "actionproof.result/v1";
  verificationId: string;
  status: VerificationStatus;
  contract: {
    contractId: string;
    revision: number;
    hash: string;
  };
  evidence: {
    bundleId: string;
    hash: string;
    provenance: "verified" | "tamper-evident" | "unverified";
    integrity: {
      bundle: "not-required" | "verified" | "missing" | "mismatch" | "unsupported";
      chain: "not-required" | "verified" | "missing" | "mismatch" | "unsupported";
      signature: "not-required" | "verified" | "missing" | "invalid" | "unverifiable";
    };
  };
  verifier: {
    name: "actionproof-verifier";
    version: string;
    profileId: string;
    profileHash: string;
  };
  summary: {
    passed: number;
    failed: number;
    blocked: number;
    unsafe: number;
    unsafeEvents: number;
    inconclusive: number;
  };
  assertionResults: AssertionResult[];
  reasonCodes: string[];
  coverage: EvidenceBundle["coverage"];
  createdAt: string;
}

export interface VerificationContext {
  verificationId: string;
  createdAt: string;
  contractHash: string;
  evidenceHash: string;
  verifierVersion: string;
  profileId: string;
  profileHash: string;
}
