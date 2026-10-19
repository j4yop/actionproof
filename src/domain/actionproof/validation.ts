import type { Contract, EvidenceBundle, EventSelector } from "./types";
import { REASON_CODES } from "./reason-codes";

export interface DomainValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export function validateDomainInputs(contract: Contract, evidence: EvidenceBundle): DomainValidationIssue[] {
  const issues: DomainValidationIssue[] = [];

  const resourceIssue = validateResourceBudget(contract, evidence);
  if (resourceIssue) issues.push(resourceIssue);

  if (evidence.contractRef.contractId !== contract.contractId || evidence.contractRef.revision !== contract.revision) {
    issues.push({
      code: REASON_CODES.CONTRACT_REFERENCE_MISMATCH,
      message: "The evidence bundle points to a different contract revision.",
      path: "evidence.contractRef",
    });
  }

  if (contract.validFrom && contract.validUntil && Date.parse(contract.validFrom) > Date.parse(contract.validUntil)) {
    issues.push({
      code: REASON_CODES.INVALID_CONTRACT,
      message: "Contract validity starts after it ends.",
      path: "contract.validFrom",
    });
  }

  const assertionIds = new Set<string>();
  for (const assertion of contract.assertions) {
    if (assertionIds.has(assertion.id)) {
      issues.push({
        code: REASON_CODES.INVALID_CONTRACT,
        message: `Assertion id \"${assertion.id}\" is duplicated.`,
        path: `contract.assertions.${assertion.id}`,
      });
    }
    assertionIds.add(assertion.id);

    if (assertion.kind === "event-present" && assertion.min !== undefined && assertion.max !== undefined && assertion.min > assertion.max) {
      issues.push({
        code: REASON_CODES.INVALID_CONTRACT,
        message: `Assertion \"${assertion.id}\" has min greater than max.`,
        path: `contract.assertions.${assertion.id}`,
      });
    }

    if (assertion.kind === "duration" && assertion.minMs !== undefined && assertion.maxMs !== undefined && assertion.minMs > assertion.maxMs) {
      issues.push({
        code: REASON_CODES.INVALID_CONTRACT,
        message: `Assertion \"${assertion.id}\" has minMs greater than maxMs.`,
        path: `contract.assertions.${assertion.id}`,
      });
    }

    for (const selector of selectorsForAssertion(assertion)) {
      for (const predicate of selector.where ?? []) {
        if (!isSafeJsonPointer(predicate.path)) {
          issues.push({
            code: REASON_CODES.INVALID_CONTRACT,
            message: `Assertion \"${assertion.id}\" contains an invalid JSON Pointer.`,
            path: `contract.assertions.${assertion.id}`,
          });
        }
      }
    }
  }

  const eventIds = new Set<string>();
  const sequenceNumbers = new Set<number>();
  for (const event of evidence.events) {
    if (eventIds.has(event.eventId)) {
      issues.push({
        code: REASON_CODES.INVALID_EVIDENCE,
        message: `Event id \"${event.eventId}\" is duplicated.`,
        path: `evidence.events.${event.eventId}`,
      });
    }
    if (sequenceNumbers.has(event.sequence)) {
      issues.push({
        code: REASON_CODES.INVALID_EVIDENCE,
        message: `Sequence number ${event.sequence} is duplicated.`,
        path: `evidence.events.${event.sequence}`,
      });
    }
    eventIds.add(event.eventId);
    sequenceNumbers.add(event.sequence);
  }

  if (evidence.coverage.startSequence !== undefined && evidence.coverage.endSequence !== undefined && evidence.coverage.startSequence > evidence.coverage.endSequence) {
    issues.push({
      code: REASON_CODES.INVALID_EVIDENCE,
      message: "Coverage starts after it ends.",
      path: "evidence.coverage",
    });
  }

  const declaresCryptographicIntegrity = evidence.provenance.integrity.chain === "event-hash-chain" || Boolean(evidence.provenance.integrity.bundleHash);
  if (declaresCryptographicIntegrity && (evidence.provenance.integrity.canonicalization !== "jcs" || evidence.provenance.integrity.hashAlgorithm !== "sha-256")) {
    issues.push({
      code: REASON_CODES.INTEGRITY_METADATA_CONTRADICTORY,
      message: "Cryptographic integrity metadata must use JCS canonicalization and SHA-256.",
      path: "evidence.provenance.integrity",
    });
  }

  if (evidence.provenance.integrity.bundleHash && evidence.provenance.integrity.hashAlgorithm !== "sha-256") {
    issues.push({
      code: REASON_CODES.INTEGRITY_METADATA_CONTRADICTORY,
      message: "A bundle hash requires SHA-256 metadata.",
      path: "evidence.provenance.integrity.hashAlgorithm",
    });
  }

  return issues;
}

function validateResourceBudget(contract: Contract, evidence: EvidenceBundle): DomainValidationIssue | undefined {
  const predicateCount = contract.assertions.reduce((total, assertion) => total + selectorsForAssertion(assertion).reduce((count, selector) => count + (selector.where?.length ?? 0), 0), 0);
  if (predicateCount > 2_000) {
    return { code: REASON_CODES.RESOURCE_LIMIT_EXCEEDED, message: "The contract contains too many predicates.", path: "contract.assertions" };
  }

  const estimatedWork = contract.assertions.length * evidence.events.length * Math.max(1, predicateCount);
  if (estimatedWork > 5_000_000) {
    return { code: REASON_CODES.RESOURCE_LIMIT_EXCEEDED, message: "The contract and evidence combination exceeds the deterministic verification work budget.", path: "payload" };
  }

  for (const event of evidence.events) {
    if (measureJsonDepth(event.payload) > 32) {
      return { code: REASON_CODES.RESOURCE_LIMIT_EXCEEDED, message: `Event \"${event.eventId}\" payload is too deeply nested.`, path: `evidence.events.${event.eventId}.payload` };
    }
  }

  return undefined;
}

function measureJsonDepth(value: unknown, depth = 0): number {
  if (value === null || typeof value !== "object") return depth;
  if (depth >= 33) return depth;
  if (Array.isArray(value)) return Math.max(depth + 1, ...value.map((item) => measureJsonDepth(item, depth + 1)));
  return Math.max(depth + 1, ...Object.values(value).map((item) => measureJsonDepth(item, depth + 1)));
}

function selectorsForAssertion(assertion: Contract["assertions"][number]): EventSelector[] {
  if (assertion.kind === "event-order") return [assertion.before, assertion.after];
  if (assertion.kind === "duration") return [assertion.start, assertion.end];
  return [assertion.selector];
}

function isSafeJsonPointer(path: string): boolean {
  if (!path.startsWith("/") || path.length > 512 || /~[^01]/.test(path)) return false;
  const parts = path.slice(1).split("/");
  return parts.length <= 32 && !parts.some((part) => ["__proto__", "prototype", "constructor"].includes(part.replaceAll("~1", "/").replaceAll("~0", "~")));
}
