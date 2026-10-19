import { z } from "zod";

const metadataSchema = z.record(z.string(), z.string()).refine((value) => Object.keys(value).length <= 256, "Metadata cannot contain more than 256 entries.");

const predicateSchema = z.union([
  z
    .object({
      path: z.string().min(1),
      op: z.enum(["eq", "neq", "lt", "lte", "gt", "gte"]),
      value: z.unknown(),
    })
    .strict(),
  z
    .object({
      path: z.string().min(1),
      op: z.enum(["in", "notIn"]),
      values: z.array(z.unknown()).min(1),
    })
    .strict(),
  z
    .object({
      path: z.string().min(1),
      op: z.literal("exists"),
      value: z.boolean(),
    })
    .strict(),
]);

const selectorSchema = z
  .object({
    type: z.string().min(1),
    where: z.array(predicateSchema).max(32).optional(),
  })
  .strict();

const assertionBase = {
  id: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  required: z.boolean(),
};

export const assertionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...assertionBase,
      kind: z.literal("event-present"),
      selector: selectorSchema,
      min: z.number().int().min(0).optional(),
      max: z.number().int().min(0).optional(),
    })
    .strict(),
  z
    .object({
      ...assertionBase,
      kind: z.literal("event-absent"),
      selector: selectorSchema,
    })
    .strict(),
  z
    .object({
      ...assertionBase,
      kind: z.literal("event-order"),
      before: selectorSchema,
      after: selectorSchema,
    })
    .strict(),
  z
    .object({
      ...assertionBase,
      kind: z.literal("duration"),
      start: selectorSchema,
      end: selectorSchema,
      minMs: z.number().min(0).optional(),
      maxMs: z.number().min(0).optional(),
    })
    .strict(),
  z
    .object({
      ...assertionBase,
      kind: z.literal("forbidden-event"),
      selector: selectorSchema,
      classification: z.literal("UNSAFE_BYPASS"),
    })
    .strict(),
]);

export const contractSchema = z
  .object({
    schema: z.literal("actionproof.contract/v1"),
    contractId: z.string().min(1).max(120),
    revision: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
    validFrom: z.string().datetime({ offset: true }).optional(),
    validUntil: z.string().datetime({ offset: true }).optional(),
    subject: z
      .object({
        kind: z.literal("browser-agent"),
        agentRef: z.string().max(160).optional(),
        workflowRef: z.string().max(160).optional(),
        environment: z.string().max(160).optional(),
      })
      .strict(),
    scope: z
      .object({
        allowedOrigins: z.array(z.string().url()).optional(),
        allowedCapabilities: z.array(z.string().min(1)).optional(),
        maxDurationMs: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    assertions: z.array(assertionSchema).min(1).max(100),
    capture: z
      .object({
        completeness: z.enum(["required", "best-effort"]),
        requiredEventTypes: z.array(z.string().min(1)).optional(),
        integrity: z.enum(["none", "hash-chain", "signed"]),
      })
      .strict(),
    metadata: metadataSchema.optional(),
  })
  .strict();

const evidenceEventSchema = z
  .object({
    eventId: z.string().min(1).max(160),
    sequence: z.number().int().nonnegative(),
    type: z.string().min(1).max(160),
    occurredAt: z.string().datetime({ offset: true }),
    actor: z
      .object({
        kind: z.enum(["browser-agent", "browser", "policy-gate", "collector", "operator", "system"]),
        ref: z.string().max(160).optional(),
      })
      .strict(),
    payload: z.record(z.string(), z.unknown()),
    source: z
      .object({
        sourceId: z.string().min(1).max(160),
        sourceKind: z.enum(["agent-runtime", "browser-instrumentation", "policy-gate", "collector", "operator"]),
        sourceVersion: z.string().min(1).max(80),
        capturedAt: z.string().datetime({ offset: true }),
        parentEventId: z.string().max(160).optional(),
      })
      .strict(),
    classification: z
      .object({
        kind: z.enum(["observation", "action-block", "policy-block", "unsafe-bypass"]),
        reason: z.string().max(500).optional(),
        affectsAssertionIds: z.array(z.string().min(1).max(120)).max(100).optional(),
      })
      .strict()
      .optional(),
    integrity: z
      .object({
        eventHash: z.string().regex(/^[a-f0-9]{64}$/),
        previousEventHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const artifactSchema = z
  .object({
    artifactId: z.string().min(1).max(160),
    kind: z.enum(["screenshot", "dom-snapshot", "network-log", "console-log", "other"]),
    mediaType: z.string().min(1).max(120),
    byteLength: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    storageRef: z.string().min(1).max(500),
    producedAt: z.string().datetime({ offset: true }),
    relatedEventIds: z.array(z.string().min(1)).max(10_000),
  })
  .strict();

export const evidenceSchema = z
  .object({
    schema: z.literal("actionproof.evidence/v1"),
    bundleId: z.string().min(1).max(160),
    contractRef: z
      .object({
        contractId: z.string().min(1).max(120),
        revision: z.number().int().positive(),
      })
      .strict(),
    run: z
      .object({
        runId: z.string().min(1).max(160),
        agentRef: z.string().max(160).optional(),
        workflowRef: z.string().max(160).optional(),
        startedAt: z.string().datetime({ offset: true }),
        endedAt: z.string().datetime({ offset: true }).optional(),
        environment: z.string().max(160).optional(),
      })
      .strict(),
    producer: z
      .object({
        componentId: z.string().min(1).max(160),
        componentVersion: z.string().min(1).max(80),
      })
      .strict(),
    coverage: z
      .object({
        mode: z.enum(["complete", "partial", "unknown"]),
        startSequence: z.number().int().nonnegative().optional(),
        endSequence: z.number().int().nonnegative().optional(),
        observedEventTypes: z.array(z.string().min(1)).max(256),
        gaps: z
          .array(
            z
              .object({
                fromSequence: z.number().int().nonnegative(),
                toSequence: z.number().int().nonnegative(),
                reason: z.string().max(300).optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
    events: z.array(evidenceEventSchema).min(1).max(10_000),
    artifacts: z.array(artifactSchema).max(500).optional(),
    provenance: z
      .object({
        captureId: z.string().min(1).max(160),
        collector: z
          .object({
            componentId: z.string().min(1).max(160),
            componentVersion: z.string().min(1).max(80),
          })
          .strict(),
        transformations: z
          .array(
            z
              .object({
                transformationId: z.string().min(1),
                kind: z.string().min(1),
                componentVersion: z.string().min(1),
                inputHash: z.string().min(1),
                outputHash: z.string().min(1),
                appliedAt: z.string().datetime({ offset: true }),
              })
              .strict(),
          )
          .optional(),
        integrity: z
          .object({
            canonicalization: z.enum(["none", "jcs"]),
            hashAlgorithm: z.enum(["none", "sha-256"]),
             bundleHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
            chain: z.enum(["none", "event-hash-chain"]),
          })
          .strict(),
        signature: z
          .object({
            algorithm: z.literal("ed25519"),
            keyId: z.string().min(1),
            signedHash: z.string().min(1),
            signature: z.string().min(1),
          })
          .strict()
          .optional(),
      })
      .strict(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export type ContractInput = z.infer<typeof contractSchema>;
export type EvidenceInput = z.infer<typeof evidenceSchema>;
