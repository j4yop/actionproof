import type { Contract, EvidenceBundle } from "./types";
import { REASON_CODES } from "./reason-codes";

export interface DomainValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export function validateDomainInputs(contract: Contract, evidence: EvidenceBundle): DomainValidationIssue[] {
  const issues: DomainValidationIssue[] = [];

  if (evidence.contractRef.contractId !== contract.contractId || evidence.contractRef.revision !== contract.revision) {
    issues.push({
      code: REASON_CODES.CONTRACT_REFERENCE_MISMATCH,
      message: "The evidence bundle points to a different contract revision.",
      path: "evidence.contractRef",
    });
  }

  if (contract.validFrom && contract.validUntil && contract.validFrom > contract.validUntil) {
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

  if (contract.capture.integrity === "hash-chain" && evidence.provenance.integrity.chain !== "event-hash-chain") {
    issues.push({
      code: REASON_CODES.HASH_CHAIN_MISSING,
      message: "The contract requires a hash chain, but the evidence bundle does not provide one.",
      path: "evidence.provenance.integrity.chain",
    });
  }

  if (contract.capture.integrity === "signed" && !evidence.provenance.signature) {
    issues.push({
      code: REASON_CODES.SIGNATURE_MISSING,
      message: "The contract requires a signature, but the evidence bundle is unsigned.",
      path: "evidence.provenance.signature",
    });
  }

  return issues;
}
