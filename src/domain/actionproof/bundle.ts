import { z } from "zod";
import { contractSchema, evidenceSchema } from "./schemas";
import { buildStoredZip, readStoredZip, ZipError, type ZipEntry } from "./zip";
import type { EvidenceBundle, VerificationResult } from "./types";

/**
 * ActionProof evidence bundle: a versioned, self-describing archive.
 *
 * Layout:
 *   manifest.json  — schema version, declared hashes, verifier profile, artifact inventory
 *   contract.json  — the expectation the verdict is bound to
 *   evidence.json  — the observations behind the verdict
 *   receipt.json   — the machine-readable verdict (optional)
 *   artifacts/     — artifact inventory, declared by reference in the manifest
 *
 * Import is strict: nothing is coerced, repaired, or best-effort. A bundle
 * that does not match its manifest is rejected with explicit issues.
 */

export const BUNDLE_SCHEMA = "actionproof.bundle/v1";
export const BUNDLE_VERSION = 1;

export const bundleManifestSchema = z
  .object({
    schema: z.literal(BUNDLE_SCHEMA),
    version: z.literal(BUNDLE_VERSION),
    createdAt: z.string().datetime({ offset: true }),
    contract: z
      .object({
        schema: z.literal("actionproof.contract/v1"),
        contractId: z.string().min(1).max(120),
        revision: z.number().int().positive(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    evidence: z
      .object({
        schema: z.literal("actionproof.evidence/v1"),
        bundleId: z.string().min(1).max(160),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    receipt: z
      .object({
        schema: z.literal("actionproof.result/v1"),
        verificationId: z.string().min(1),
        status: z.enum(["PASS", "DRIFT", "BLOCKED", "UNSAFE_BYPASS", "INCONCLUSIVE"]),
        contractHash: z.string().min(1),
        evidenceHash: z.string().min(1),
        verifier: z
          .object({
            name: z.string().min(1),
            version: z.string().min(1),
            profileId: z.string().min(1),
            profileHash: z.string().min(1),
          })
          .strict(),
      })
      .strict()
      .optional(),
    artifacts: z
      .array(
        z
          .object({
            artifactId: z.string().min(1).max(160),
            kind: z.enum(["screenshot", "dom-snapshot", "network-log", "console-log", "other"]),
            mediaType: z.string().min(1).max(120),
            byteLength: z.number().int().nonnegative(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/i),
            storageRef: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

export type BundleManifest = z.infer<typeof bundleManifestSchema>;

export interface BundleFile {
  name: string;
  data: Uint8Array;
}

export interface BundleContents {
  manifest: BundleManifest;
  contract: z.infer<typeof contractSchema>;
  evidence: z.infer<typeof evidenceSchema>;
  receipt?: unknown;
}

export interface BundleValidation {
  ok: boolean;
  issues: string[];
  contents?: BundleContents;
}

/** SHA-256 over raw bytes, using the platform WebCrypto API (browser and Node). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface BuildBundleInput {
  contract: unknown;
  evidence: EvidenceBundle;
  receipt?: VerificationResult | null;
  createdAt: string;
}

export async function buildBundleFiles(input: BuildBundleInput): Promise<BundleFile[]> {
  const contractJson = JSON.stringify(input.contract, null, 2);
  const evidenceJson = JSON.stringify(input.evidence, null, 2);
  const contractBytes = encoder.encode(contractJson);
  const evidenceBytes = encoder.encode(evidenceJson);

  const manifest: BundleManifest = {
    schema: BUNDLE_SCHEMA,
    version: BUNDLE_VERSION,
    createdAt: input.createdAt,
    contract: {
      schema: "actionproof.contract/v1",
      contractId: (input.contract as { contractId?: string }).contractId ?? "unknown",
      revision: (input.contract as { revision?: number }).revision ?? 1,
      sha256: await sha256Hex(contractBytes),
    },
    evidence: {
      schema: "actionproof.evidence/v1",
      bundleId: input.evidence.bundleId,
      sha256: await sha256Hex(evidenceBytes),
    },
    ...(input.receipt
      ? {
          receipt: {
            schema: "actionproof.result/v1" as const,
            verificationId: input.receipt.verificationId,
            status: input.receipt.status,
            contractHash: input.receipt.contract.hash,
            evidenceHash: input.receipt.evidence.hash,
            verifier: {
              name: input.receipt.verifier.name,
              version: input.receipt.verifier.version,
              profileId: input.receipt.verifier.profileId,
              profileHash: input.receipt.verifier.profileHash,
            },
          },
        }
      : {}),
    artifacts: (input.evidence.artifacts ?? []).map((artifact) => ({
      artifactId: artifact.artifactId,
      kind: artifact.kind,
      mediaType: artifact.mediaType,
      byteLength: artifact.byteLength,
      sha256: artifact.sha256.toLowerCase(),
      storageRef: artifact.storageRef,
    })),
  };

  const files: BundleFile[] = [
    { name: "manifest.json", data: encoder.encode(JSON.stringify(manifest, null, 2)) },
    { name: "contract.json", data: contractBytes },
    { name: "evidence.json", data: evidenceBytes },
  ];

  if (input.receipt) {
    files.push({ name: "receipt.json", data: encoder.encode(JSON.stringify(input.receipt, null, 2)) });
  }

  return files;
}

export async function buildBundleZip(input: BuildBundleInput): Promise<Uint8Array> {
  const files = await buildBundleFiles(input);
  return buildStoredZip(files.map((file) => ({ name: file.name, data: file.data })));
}

/** Validates bundle files strictly. Nothing is coerced, repaired, or guessed. */
export async function validateBundleFiles(files: BundleFile[]): Promise<BundleValidation> {
  const issues: string[] = [];
  const byName = new Map(files.map((file) => [file.name, file]));

  const manifestFile = byName.get("manifest.json");
  if (!manifestFile) {
    return { ok: false, issues: ["manifest.json is missing from the bundle."] };
  }

  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(decoder.decode(manifestFile.data));
  } catch {
    return { ok: false, issues: ["manifest.json is not valid JSON."] };
  }

  const manifestResult = bundleManifestSchema.safeParse(manifestJson);
  if (!manifestResult.success) {
    for (const issue of manifestResult.error.issues) {
      issues.push(`manifest.json ${issue.path.join(".") || "manifest"}: ${issue.message}`);
    }
    return { ok: false, issues };
  }
  const manifest = manifestResult.data;

  const contractFile = byName.get("contract.json");
  const evidenceFile = byName.get("evidence.json");
  if (!contractFile) issues.push("contract.json is missing from the bundle.");
  if (!evidenceFile) issues.push("evidence.json is missing from the bundle.");
  if (issues.length > 0) return { ok: false, issues };

  let contractJson: unknown;
  let evidenceJson: unknown;
  try {
    contractJson = JSON.parse(decoder.decode(contractFile!.data));
  } catch {
    issues.push("contract.json is not valid JSON.");
  }
  try {
    evidenceJson = JSON.parse(decoder.decode(evidenceFile!.data));
  } catch {
    issues.push("evidence.json is not valid JSON.");
  }
  if (issues.length > 0) return { ok: false, issues };

  const contractResult = contractSchema.safeParse(contractJson);
  if (!contractResult.success) {
    for (const issue of contractResult.error.issues) {
      issues.push(`contract.json ${issue.path.join(".") || "contract"}: ${issue.message}`);
    }
    return { ok: false, issues };
  }
  const evidenceResult = evidenceSchema.safeParse(evidenceJson);
  if (!evidenceResult.success) {
    for (const issue of evidenceResult.error.issues) {
      issues.push(`evidence.json ${issue.path.join(".") || "evidence"}: ${issue.message}`);
    }
    return { ok: false, issues };
  }

  const contractHash = await sha256Hex(contractFile!.data);
  const evidenceHash = await sha256Hex(evidenceFile!.data);
  if (contractHash !== manifest.contract.sha256) {
    issues.push("contract.json does not match the sha256 declared in manifest.json.");
  }
  if (evidenceHash !== manifest.evidence.sha256) {
    issues.push("evidence.json does not match the sha256 declared in manifest.json.");
  }
  if (manifest.contract.contractId !== contractResult.data.contractId || manifest.contract.revision !== contractResult.data.revision) {
    issues.push("manifest.json declares a different contract identity than contract.json.");
  }
  if (manifest.evidence.bundleId !== evidenceResult.data.bundleId) {
    issues.push("manifest.json declares a different evidence bundle than evidence.json.");
  }

  let receipt: unknown;
  if (manifest.receipt) {
    const receiptFile = byName.get("receipt.json");
    if (!receiptFile) {
      issues.push("manifest.json declares a receipt but receipt.json is missing.");
    } else {
      try {
        receipt = JSON.parse(decoder.decode(receiptFile.data));
      } catch {
        issues.push("receipt.json is not valid JSON.");
      }
      if (receipt !== undefined) {
        const receiptRecord = receipt as { schema?: string; verificationId?: string; status?: string };
        if (receiptRecord.schema !== "actionproof.result/v1") {
          issues.push("receipt.json does not use the actionproof.result/v1 schema.");
        }
        if (receiptRecord.verificationId !== manifest.receipt.verificationId) {
          issues.push("receipt.json does not match the verification id declared in manifest.json.");
        }
        if (receiptRecord.status !== manifest.receipt.status) {
          issues.push("receipt.json does not match the status declared in manifest.json.");
        }
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    issues: [],
    contents: {
      manifest,
      contract: contractResult.data,
      evidence: evidenceResult.data,
      ...(receipt !== undefined ? { receipt } : {}),
    },
  };
}

export interface BundleReadResult {
  ok: boolean;
  issues: string[];
  contents?: BundleContents;
}

/** Reads a bundle archive. Only stored (uncompressed) archives are accepted. */
export async function readBundleArchive(bytes: Uint8Array): Promise<BundleReadResult> {
  let entries: ZipEntry[];
  try {
    entries = readStoredZip(bytes);
  } catch (error) {
    if (error instanceof ZipError) {
      return { ok: false, issues: [error.message] };
    }
    return { ok: false, issues: ["The bundle archive could not be read."] };
  }

  return validateBundleFiles(entries.map((entry) => ({ name: entry.name, data: entry.data })));
}
