# ActionProof architecture

## Responsibility boundaries

### Domain layer

`src/domain/actionproof` is the trust boundary. It contains no HTTP, React, Next.js, database, browser, network, or model code.

The public entry point is:

```ts
verify(contract, evidence, context): VerificationResult
```

The context supplies request-scoped identifiers and hashes calculated by the application boundary. The verifier never calls the clock or creates random identifiers.

### Application boundary

`src/app/api/verify/route.ts` is intentionally thin. It:

1. reads the request body;
2. enforces the body-size limit;
3. parses JSON;
4. validates the contract and evidence schemas;
5. computes stable SHA-256 fingerprints;
6. supplies a request ID and verifier profile;
7. calls the domain verifier;
8. maps validation and system failures to HTTP responses.

The same domain function can later be called by a CLI, background job, or persisted verification service without changing its semantics.

### Presentation layer

The live console accepts arbitrary JSON text. Fixture buttons are convenience inputs, not a second execution path. The result panel only renders the persisted API result; it does not independently reinterpret the evidence.

## Data flow

```text
Contract JSON + Evidence JSON
          │
          ▼
     Zod schemas
          │
          ▼
 Cross-document validation
          │
          ▼
   Ordered event trace
          │
          ▼
Finite assertion evaluator
          │
          ▼
 Precedence classifier
          │
          ▼
Explainable verification receipt
```

## Why there is no database yet

The live buildathon product needs judges to submit input and see a result, but it does not need accounts, retention, or multi-tenant state to prove the mechanism. Keeping the MVP stateless reduces the risk of storing sensitive agent traces and makes deployments reproducible.

The next production seam is explicit: persistence can be added behind an application service without moving verification logic into the database or route handler.

## Security and trust boundary

The verifier does not fetch artifact URLs, execute user code, evaluate user-supplied JavaScript, or interpret screenshots. An artifact hash proves only that the submitted artifact bytes match the declared digest; it does not prove that the collector was honest.

Evidence provenance therefore has three separate meanings:

- `unverified`: no bundle hash, chain, or signature is present;
- `tamper-evident`: a bundle hash or event chain is present;
- `verified`: a bundle hash and signature are present in the submitted metadata.

The result makes this distinction visible instead of collapsing it into a security badge.

## Deployment

The Next.js route runs as a Vercel function. The deployment requires no environment variables. Vercel Deployment Protection must remain disabled for the public judge URL, otherwise unauthenticated judges will see an access wall instead of the console.
