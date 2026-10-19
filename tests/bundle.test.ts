import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildBundleFiles, buildBundleZip, readBundleArchive, sha256Hex, validateBundleFiles } from "@/domain/actionproof/bundle";
import { getExample } from "@/domain/actionproof/examples";
import { crc32, readStoredZip } from "@/domain/actionproof/zip";

const encoder = new TextEncoder();

describe("bundle archive format", () => {
  it("computes the standard CRC-32 check value", () => {
    expect(crc32(encoder.encode("123456789"))).toBe(0xcbf43926);
  });

  it("round-trips stored entries through the archive", async () => {
    const example = getExample("pass");
    expect(example).toBeDefined();

    const files = await buildBundleFiles({
      contract: example!.contract,
      evidence: example!.evidence,
      receipt: null,
      createdAt: "2026-10-20T09:00:00.000Z",
    });
    const archive = await buildBundleZip({
      contract: example!.contract,
      evidence: example!.evidence,
      receipt: null,
      createdAt: "2026-10-20T09:00:00.000Z",
    });

    expect(archive[0]).toBe(0x50); // "PK"
    expect(archive[1]).toBe(0x4b);

    const entries = readStoredZip(archive);
    expect(entries.map((entry) => entry.name)).toEqual(["manifest.json", "contract.json", "evidence.json"]);
    expect(new TextDecoder().decode(entries[1].data)).toBe(JSON.stringify(example!.contract, null, 2));
  });

  it("rejects a compressed entry instead of guessing", async () => {
    const archive = await buildBundleZip({
      contract: getExample("pass")!.contract,
      evidence: getExample("pass")!.evidence,
      receipt: null,
      createdAt: "2026-10-20T09:00:00.000Z",
    });

    // Flip the compression method of the first central directory entry to 8 (deflate).
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    let endOffset = -1;
    for (let index = archive.byteLength - 22; index >= 0; index -= 1) {
      if (view.getUint32(index, true) === 0x06054b50) {
        endOffset = index;
        break;
      }
    }
    const centralOffset = view.getUint32(endOffset + 16, true);
    view.setUint16(centralOffset + 10, 8, true);

    expect(() => readStoredZip(archive)).toThrowError(/compressed/i);
  });
});

describe("bundle manifest", () => {
  it("declares the schema version, hashes, verifier profile, and artifact inventory", async () => {
    const example = getExample("pass");
    const files = await buildBundleFiles({
      contract: example!.contract,
      evidence: example!.evidence,
      receipt: null,
      createdAt: "2026-10-20T09:00:00.000Z",
    });
    const manifest = JSON.parse(new TextDecoder().decode(files[0].data)) as {
      schema: string;
      version: number;
      contract: { sha256: string; contractId: string };
      evidence: { sha256: string; bundleId: string };
      artifacts: unknown[];
    };

    expect(manifest.schema).toBe("actionproof.bundle/v1");
    expect(manifest.version).toBe(1);
    expect(manifest.contract.contractId).toBe(example!.contract.contractId);
    expect(manifest.evidence.bundleId).toBe(example!.evidence.bundleId);
    expect(manifest.artifacts).toEqual([]);

    // The declared hash must match an independent SHA-256 implementation.
    const contractBytes = encoder.encode(JSON.stringify(example!.contract, null, 2));
    const expected = createHash("sha256").update(contractBytes).digest("hex");
    expect(manifest.contract.sha256).toBe(expected);
    expect(await sha256Hex(contractBytes)).toBe(expected);
  });

  it("accepts a bundle that matches its manifest", async () => {
    const example = getExample("pass");
    const files = await buildBundleFiles({
      contract: example!.contract,
      evidence: example!.evidence,
      receipt: null,
      createdAt: "2026-10-20T09:00:00.000Z",
    });

    const validation = await validateBundleFiles(files);

    expect(validation.ok).toBe(true);
    expect(validation.issues).toEqual([]);
    expect(validation.contents?.contract.contractId).toBe(example!.contract.contractId);
  });

  it("rejects a tampered contract file instead of repairing it", async () => {
    const example = getExample("pass");
    const files = await buildBundleFiles({
      contract: example!.contract,
      evidence: example!.evidence,
      receipt: null,
      createdAt: "2026-10-20T09:00:00.000Z",
    });
    const tampered = files.map((file) =>
      file.name === "contract.json"
        ? { ...file, data: encoder.encode(JSON.stringify({ ...example!.contract, contractId: "tampered.contract" }, null, 2)) }
        : file,
    );

    const validation = await validateBundleFiles(tampered);

    expect(validation.ok).toBe(false);
    expect(validation.issues.join(" ")).toMatch(/sha256|contract identity/i);
  });

  it("rejects a manifest with an unknown schema version", async () => {
    const example = getExample("pass");
    const files = await buildBundleFiles({
      contract: example!.contract,
      evidence: example!.evidence,
      receipt: null,
      createdAt: "2026-10-20T09:00:00.000Z",
    });
    const manifest = JSON.parse(new TextDecoder().decode(files[0].data)) as Record<string, unknown>;
    const tampered = files.map((file) =>
      file.name === "manifest.json" ? { ...file, data: encoder.encode(JSON.stringify({ ...manifest, version: 99 })) } : file,
    );

    const validation = await validateBundleFiles(tampered);

    expect(validation.ok).toBe(false);
    expect(validation.issues.join(" ")).toMatch(/version/i);
  });

  it("rejects a bundle that is missing its contract file", async () => {
    const example = getExample("pass");
    const files = await buildBundleFiles({
      contract: example!.contract,
      evidence: example!.evidence,
      receipt: null,
      createdAt: "2026-10-20T09:00:00.000Z",
    });
    const withoutContract = files.filter((file) => file.name !== "contract.json");

    const validation = await validateBundleFiles(withoutContract);

    expect(validation.ok).toBe(false);
    expect(validation.issues.join(" ")).toMatch(/contract\.json is missing/i);
  });

  it("reads a bundle archive back into its contract and evidence", async () => {
    const example = getExample("unsafe");
    const archive = await buildBundleZip({
      contract: example!.contract,
      evidence: example!.evidence,
      receipt: null,
      createdAt: "2026-10-20T09:00:00.000Z",
    });

    const read = await readBundleArchive(archive);

    expect(read.ok).toBe(true);
    expect(read.contents?.contract.contractId).toBe(example!.contract.contractId);
    expect(read.contents?.evidence.events.length).toBe(example!.evidence.events.length);
  });

  it("rejects an archive that is not a bundle at all", async () => {
    const read = await readBundleArchive(encoder.encode("this is not a zip file"));

    expect(read.ok).toBe(false);
    expect(read.issues.length).toBeGreaterThan(0);
  });
});
