#!/usr/bin/env node
"use strict";

/**
 * ActionProof offline verification.
 *
 * Verifies a contract against an evidence bundle with the same deterministic
 * kernel the hosted console uses — no browser, no model, no network.
 *
 * What this command verifies: the supplied contract, the supplied evidence
 * bundle, and the verifier profile printed below. It does not verify the
 * external world, the honesty of the collector, or the origin of the trace.
 * It cannot turn a claim into proof.
 *
 * Usage:
 *   npm run verify:offline -- <contract.json> <evidence.json>
 *   npm run verify:offline -- --bundle <bundle.zip>
 *   npm run verify:offline -- --stdin < payload.json
 *
 * Exit codes:
 *   0  verdict PASS
 *   1  verdict is not PASS (DRIFT, BLOCKED, UNSAFE_BYPASS, INCONCLUSIVE)
 *   2  invalid input (schema or domain validation failed)
 *   3  usage error
 */

const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");

const DIST_ROOT = path.join(__dirname, "..", "dist", "cli", "domain", "actionproof");

function loadDomain() {
  const missing = ["verify", "schemas", "stable-json", "profile", "bundle"].filter(
    (name) => !fs.existsSync(path.join(DIST_ROOT, `${name}.js`)),
  );
  if (missing.length > 0) {
    process.stderr.write("ActionProof offline verifier is not built. Run: npm run build:cli\n");
    process.exit(3);
  }
  /* eslint-disable @typescript-eslint/no-var-requires */
  return {
    verifyModule: require(path.join(DIST_ROOT, "verify.js")),
    schemas: require(path.join(DIST_ROOT, "schemas.js")),
    stableJson: require(path.join(DIST_ROOT, "stable-json.js")),
    profile: require(path.join(DIST_ROOT, "profile.js")),
    bundle: require(path.join(DIST_ROOT, "bundle.js")),
  };
}

function usage() {
  process.stderr.write(
    [
      "Usage:",
      "  npm run verify:offline -- <contract.json> <evidence.json>",
      "  npm run verify:offline -- --bundle <bundle.zip>",
      "  npm run verify:offline -- --stdin < payload.json",
      "",
      "The payload read from stdin must be a JSON object with `contract` and `evidence` members.",
      "",
    ].join("\n"),
  );
  process.exit(3);
}

function sha256(value) {
  return createHash("sha256").update(domain.stableJson.stableStringify(value)).digest("hex");
}

let domain;

async function main(argv) {
  domain = loadDomain();

  if (argv.includes("--help") || argv.includes("-h")) {
    usage();
  }

  let contract;
  let evidence;

  const bundleIndex = argv.indexOf("--bundle");
  const stdinIndex = argv.indexOf("--stdin");

  if (bundleIndex >= 0) {
    const bundlePath = argv[bundleIndex + 1];
    if (!bundlePath) usage();
    const bytes = new Uint8Array(fs.readFileSync(bundlePath));
    const read = await domain.bundle.readBundleArchive(bytes);
    if (!read.ok || !read.contents) {
      process.stderr.write("The bundle was rejected:\n");
      for (const issue of read.issues) process.stderr.write(`  - ${issue}\n`);
      process.exit(2);
    }
    contract = read.contents.contract;
    evidence = read.contents.evidence;
  } else if (stdinIndex >= 0) {
    const raw = fs.readFileSync(0, "utf8");
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      process.stderr.write(`stdin is not valid JSON: ${error.message}\n`);
      process.exit(2);
    }
    if (!payload || typeof payload !== "object" || !payload.contract || !payload.evidence) {
      process.stderr.write("stdin must contain a JSON object with `contract` and `evidence` members.\n");
      process.exit(2);
    }
    contract = payload.contract;
    evidence = payload.evidence;
  } else {
    if (argv.length < 2) usage();
    const contractPath = argv[0];
    const evidencePath = argv[1];
    try {
      contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    } catch (error) {
      process.stderr.write(`${contractPath} is not valid JSON: ${error.message}\n`);
      process.exit(2);
    }
    try {
      evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    } catch (error) {
      process.stderr.write(`${evidencePath} is not valid JSON: ${error.message}\n`);
      process.exit(2);
    }
  }

  const contractResult = domain.schemas.contractSchema.safeParse(contract);
  const evidenceResult = domain.schemas.evidenceSchema.safeParse(evidence);
  if (!contractResult.success || !evidenceResult.success) {
    process.stderr.write("The input does not match ActionProof v1:\n");
    for (const issue of contractResult.success ? [] : contractResult.error.issues) {
      process.stderr.write(`  - contract ${issue.path.join(".") || "payload"}: ${issue.message}\n`);
    }
    for (const issue of evidenceResult.success ? [] : evidenceResult.error.issues) {
      process.stderr.write(`  - evidence ${issue.path.join(".") || "payload"}: ${issue.message}\n`);
    }
    process.exit(2);
  }

  const parsedContract = contractResult.data;
  const parsedEvidence = evidenceResult.data;
  const profile = domain.profile.VERIFIER_PROFILE;

  let result;
  try {
    result = domain.verifyModule.verify(parsedContract, parsedEvidence, {
      verificationId: randomUUID(),
      createdAt: new Date().toISOString(),
      contractHash: sha256(parsedContract),
      evidenceHash: sha256(parsedEvidence),
      verifierVersion: domain.profile.VERIFIER_VERSION,
      profileId: profile.id,
      profileHash: sha256(profile),
    });
  } catch (error) {
    if (error && error.name === "VerificationInputError") {
      process.stderr.write(`The input failed domain validation:\n`);
      for (const issue of error.issues ?? []) {
        process.stderr.write(`  - ${issue.path ? `${issue.path}: ` : ""}${issue.message}\n`);
      }
      process.exit(2);
    }
    throw error;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.stderr.write(
    [
      `Verdict: ${result.status}`,
      `Verifier: ${result.verifier.name} v${result.verifier.version} · profile ${result.verifier.profileId}`,
      "This command verified the supplied contract, evidence bundle, and verifier profile. It did not verify the external world or the honesty of the collector.",
      "",
    ].join("\n"),
  );

  process.exit(result.status === "PASS" ? 0 : 1);
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`The verification could not be completed: ${error && error.message ? error.message : error}\n`);
  process.exit(2);
});
