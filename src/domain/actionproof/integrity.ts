import { createHash } from "node:crypto";
import type { Contract, EvidenceBundle, EvidenceEvent } from "./types";
import { REASON_CODES } from "./reason-codes";
import { stableStringify } from "./stable-json";

export type IntegrityState = "not-required" | "verified" | "missing" | "mismatch" | "unsupported";
export type SignatureState = "not-required" | "verified" | "missing" | "invalid" | "unverifiable";

export interface IntegrityAssessment {
  bundle: IntegrityState;
  chain: IntegrityState;
  signature: SignatureState;
  provenance: "verified" | "tamper-evident" | "unverified";
  reasonCodes: string[];
}

export function assessIntegrity(contract: Contract, evidence: EvidenceBundle): IntegrityAssessment {
  const requiresChain = contract.capture.integrity === "hash-chain";
  const requiresSignature = contract.capture.integrity === "signed";
  const declaredChain = evidence.provenance.integrity.chain === "event-hash-chain";
  const declaredBundleHash = Boolean(evidence.provenance.integrity.bundleHash);
  const metadataIsJcs = evidence.provenance.integrity.canonicalization === "jcs";
  const metadataIsSha256 = evidence.provenance.integrity.hashAlgorithm === "sha-256";

  const reasonCodes: string[] = [];
  let chain: IntegrityState = requiresChain || declaredChain ? "missing" : "not-required";
  let bundle: IntegrityState = requiresChain || declaredBundleHash ? "missing" : "not-required";

  if ((declaredChain || declaredBundleHash) && (!metadataIsJcs || !metadataIsSha256)) {
    reasonCodes.push(REASON_CODES.INTEGRITY_METADATA_CONTRADICTORY);
    chain = declaredChain ? "mismatch" : chain;
    bundle = declaredBundleHash ? "mismatch" : bundle;
  } else {
    if (declaredChain || requiresChain) {
      const chainResult = verifyEventChain(evidence.events);
      chain = chainResult.state;
      reasonCodes.push(...chainResult.reasonCodes);
    }

    if (declaredBundleHash || requiresChain) {
      if (!evidence.provenance.integrity.bundleHash) {
        reasonCodes.push(REASON_CODES.BUNDLE_HASH_MISSING);
        bundle = "missing";
      } else {
        const expected = hashBundle(evidence);
        bundle = expected === evidence.provenance.integrity.bundleHash ? "verified" : "mismatch";
        if (bundle === "mismatch") reasonCodes.push(REASON_CODES.BUNDLE_HASH_MISMATCH);
      }
    }
  }

  let signature: SignatureState = requiresSignature ? "missing" : "not-required";
  if (requiresSignature) {
    if (!evidence.provenance.signature) {
      reasonCodes.push(REASON_CODES.SIGNATURE_MISSING);
    } else {
      signature = "unverifiable";
      reasonCodes.push(REASON_CODES.SIGNATURE_UNVERIFIABLE);
    }
  }

  const verifiedCryptographicMaterial = chain === "verified" || bundle === "verified";
  const provenance = verifiedCryptographicMaterial ? "tamper-evident" : "unverified";

  return { bundle, chain, signature, provenance, reasonCodes: [...new Set(reasonCodes)] };
}

export function hashEvent(event: EvidenceEvent, previousEventHash: string | null): string {
  const { integrity: _integrity, ...eventWithoutIntegrity } = event;
  return hashValue({
    protocol: "actionproof.event-hash/v1",
    previousEventHash,
    event: eventWithoutIntegrity,
  });
}

export function hashBundle(evidence: EvidenceBundle): string {
  const { provenance, ...bundleWithoutProvenance } = evidence;
  const { integrity, signature: _signature, ...provenanceWithoutSignature } = provenance;
  const { bundleHash: _bundleHash, ...integrityWithoutBundleHash } = integrity;

  return hashValue({
    protocol: "actionproof.bundle-hash/v1",
    bundle: {
      ...bundleWithoutProvenance,
      provenance: {
        ...provenanceWithoutSignature,
        integrity: integrityWithoutBundleHash,
      },
    },
  });
}

function verifyEventChain(events: EvidenceEvent[]): { state: IntegrityState; reasonCodes: string[] } {
  const orderedEvents = [...events].sort((left, right) => left.sequence - right.sequence);
  let previousEventHash: string | null = null;
  const reasonCodes: string[] = [];

  for (const event of orderedEvents) {
    if (!event.integrity) {
      reasonCodes.push(REASON_CODES.EVENT_HASH_MISSING);
      return { state: "missing", reasonCodes };
    }

    if ((event.integrity.previousEventHash ?? null) !== previousEventHash) {
      reasonCodes.push(REASON_CODES.PREVIOUS_EVENT_HASH_MISMATCH);
      return { state: "mismatch", reasonCodes };
    }

    const expectedEventHash = hashEvent(event, previousEventHash);
    if (event.integrity.eventHash !== expectedEventHash) {
      reasonCodes.push(REASON_CODES.EVENT_HASH_MISMATCH);
      return { state: "mismatch", reasonCodes };
    }

    previousEventHash = event.integrity.eventHash;
  }

  return { state: "verified", reasonCodes };
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}
