import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildBundleZip } from "@/domain/actionproof/bundle";
import { getExample } from "@/domain/actionproof/examples";

const repoRoot = process.cwd();
const workspace = mkdtempSync(join(tmpdir(), "actionproof-cli-"));

function runCli(args: string[], input?: string) {
  const result = spawnSync("node", ["scripts/verify-offline.cjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function writeFixture(name: string, value: unknown): string {
  const file = join(workspace, name);
  writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}

beforeAll(() => {
  execFileSync("npm", ["run", "build:cli"], { cwd: repoRoot, stdio: "ignore" });
}, 120_000);

describe("offline verification command", () => {
  it("verifies a contract and evidence bundle with the deterministic kernel", () => {
    const example = getExample("pass");
    const contract = writeFixture("contract.json", example!.contract);
    const evidence = writeFixture("evidence.json", example!.evidence);

    const run = runCli([contract, evidence]);

    expect(run.status).toBe(0);
    const result = JSON.parse(run.stdout) as { status: string; verifier: { profileId: string; version: string } };
    expect(result.status).toBe("PASS");
    expect(result.verifier.profileId).toBe("actionproof-web-v1.1");
    expect(result.verifier.version).toBe("1.1.0");
  });

  it("exits non-zero for a verdict that is not a pass", () => {
    const example = getExample("unsafe");
    const contract = writeFixture("contract-unsafe.json", example!.contract);
    const evidence = writeFixture("evidence-unsafe.json", example!.evidence);

    const run = runCli([contract, evidence]);

    expect(run.status).toBe(1);
    expect((JSON.parse(run.stdout) as { status: string }).status).toBe("UNSAFE_BYPASS");
  });

  it("states the trust boundary on every run", () => {
    const example = getExample("pass");
    const contract = writeFixture("contract-boundary.json", example!.contract);
    const evidence = writeFixture("evidence-boundary.json", example!.evidence);

    const run = runCli([contract, evidence]);

    expect(run.stderr).toContain("did not verify the external world");
    expect(run.stderr).toContain("supplied contract, evidence bundle, and verifier profile");
  });

  it("rejects input that is not valid JSON without running the verifier", () => {
    const broken = join(workspace, "broken.json");
    writeFileSync(broken, "{ not json");

    const run = runCli([broken, join(workspace, "evidence.json")]);

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("not valid JSON");
  });

  it("rejects input that does not match the ActionProof v1 schema", () => {
    const contract = writeFixture("contract-invalid.json", { schema: "actionproof.contract/v1", contractId: "x" });
    const evidence = writeFixture("evidence-valid.json", getExample("pass")!.evidence);

    const run = runCli([contract, evidence]);

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("does not match ActionProof v1");
  });

  it("verifies directly from a bundle archive", async () => {
    const example = getExample("pass");
    const archive = await buildBundleZip({
      contract: example!.contract,
      evidence: example!.evidence,
      receipt: null,
      createdAt: new Date().toISOString(),
    });
    const bundlePath = join(workspace, "bundle.zip");
    writeFileSync(bundlePath, archive);

    const run = runCli(["--bundle", bundlePath]);

    expect(run.status).toBe(0);
    expect((JSON.parse(run.stdout) as { status: string }).status).toBe("PASS");
  });

  it("reads a contract and evidence payload from stdin", () => {
    const example = getExample("pass");
    const payload = JSON.stringify({ contract: example!.contract, evidence: example!.evidence });

    const run = runCli(["--stdin"], payload);

    expect(run.status).toBe(0);
    expect((JSON.parse(run.stdout) as { status: string }).status).toBe("PASS");
  });

  it("prints usage when no input is supplied", () => {
    const run = runCli([]);

    expect(run.status).toBe(3);
    expect(run.stderr).toContain("Usage:");
  });
});
