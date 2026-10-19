# Sample: account recovery (a flow that is **not** a built-in fixture)

This is an independent end-to-end sample you can use to test ActionProof without
touching the built-in gallery fixtures. It models a browser agent performing a
password reset.

## Files

| File | What it is |
|---|---|
| `contract.json` | The expectation: what must happen, what must not, and the boundaries |
| `evidence-pass.json` | A real trace that satisfies the contract → verdict **PASS** |
| `evidence-false-success.json` | The same run, but the server request never happened → verdict **DRIFT** |

The adversarial file is the interesting one: the agent confirms the reset on
screen and reports success, but the `POST /api/account/recovery` request is
absent from the trace. ActionProof refuses to treat a green screen as proof.

### The two files differ by exactly one event

```text
$ diff <events in evidence-pass.json> <events in evidence-false-success.json>
8d7
< recovery-request (network.request)
```

That single missing event is the difference between `PASS` and `DRIFT`. The
verdict is computed from the evidence — it is not a fixture answer.

### Verdict matrix (all produced live by the same verifier)

| Input | Verdict | Decisive reason |
|---|---|---|
| `evidence-pass.json` as shipped | `PASS` | ASSERTION_PASSED |
| `evidence-false-success.json` as shipped | `DRIFT` | EVENT_COUNT_OUT_OF_RANGE (the request was never observed) |
| add the missing `network.request` event | `PASS` | ASSERTION_PASSED |
| add a `capability.used: smtp-relay` event | `UNSAFE_BYPASS` | EVENT_FORBIDDEN, CAPABILITY_OUTSIDE_SCOPE |
| mark the capture `partial` | `INCONCLUSIVE` | COVERAGE_INCOMPLETE |
| swap `identity-check` and `reset-password` | `DRIFT` | EVENT_ORDER_WRONG |
| navigate to a different origin | `DRIFT` | ORIGIN_OUTSIDE_SCOPE |

`tests/sample-liveness.test.ts` asserts every row of this matrix, so the
behaviour is locked in CI and cannot silently regress into a hardcoded answer.

## Test it from the terminal

```bash
# 1. offline, no server needed
npm run verify:offline -- samples/account-recovery/contract.json samples/account-recovery/evidence-pass.json
#    -> verdict PASS, exit code 0

npm run verify:offline -- samples/account-recovery/contract.json samples/account-recovery/evidence-false-success.json
#    -> verdict DRIFT (EVENT_COUNT_OUT_OF_RANGE), exit code 1
```

```bash
# 2. against a running server
npm run dev
curl -s -X POST http://localhost:3000/api/verify \
  -H 'content-type: application/json' \
  -d "{\"contract\": $(cat samples/account-recovery/contract.json), \"evidence\": $(cat samples/account-recovery/evidence-pass.json)}"
```

## Test it in the console

1. `npm run dev` and open http://localhost:3000
2. Switch the input mode to **Expert JSON**
3. Paste the contents of `contract.json` into the **CONTRACT** editor
4. Paste the contents of `evidence-pass.json` into the **EVIDENCE BUNDLE** editor
5. Press **Verify evidence** → the verdict appears on the right
6. Repeat with `evidence-false-success.json` → the verdict flips to **DRIFT**, and
   the evidence explorer shows the missing request as a failed assertion

## Full system check

```bash
./scripts/system-check.sh
```

Runs the typecheck, the test suite, the production build, boots the production
server, exercises the API happy path and every failure path (malformed JSON,
schema-invalid input, oversized body, wrong method), and runs the offline CLI
against both samples.
