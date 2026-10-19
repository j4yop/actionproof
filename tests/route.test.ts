import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/verify/route";
import { getExample } from "@/domain/actionproof/examples";

describe("POST /api/verify", () => {
  it("returns a computed result for valid custom input", async () => {
    const fixture = getExample("pass");
    const response = await POST(new Request("http://localhost/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "route-test-pass" },
      body: JSON.stringify({ contract: fixture?.contract, evidence: fixture?.evidence }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.status).toBe("PASS");
    expect(body.result.contract.hash).toHaveLength(64);
  });

  it("rejects an oversized request before verification", async () => {
    const response = await POST(new Request("http://localhost/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "route-test-large" },
      body: `{"payload":"${"x".repeat(512_000)}"}`,
    }));

    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("BODY_TOO_LARGE");
  });

  it("returns structured schema errors for invalid custom input", async () => {
    const response = await POST(new Request("http://localhost/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "route-test-invalid" },
      body: JSON.stringify({ contract: {}, evidence: {} }),
    }));

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("SCHEMA_VALIDATION_FAILED");
  });
});
