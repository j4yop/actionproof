#!/usr/bin/env bash
# ActionProof full system check.
# Exercises every layer with real requests: build, tests, production server,
# API happy path, API failure paths, and the offline CLI.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 3

PORT="${PORT:-3107}"
SAMPLE="samples/account-recovery"
PASS=0
FAIL=0

ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAIL=$((FAIL+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

head_ "1. Build pipeline"
if npm run typecheck >/tmp/ap-check-typecheck.log 2>&1; then ok "typecheck"; else bad "typecheck (see /tmp/ap-check-typecheck.log)"; fi
if npm test >/tmp/ap-check-test.log 2>&1; then ok "test suite ($(grep -oE 'Tests +[0-9]+ passed' /tmp/ap-check-test.log | tail -1))"; else bad "test suite (see /tmp/ap-check-test.log)"; fi
if npm run build >/tmp/ap-check-build.log 2>&1; then ok "production build"; else bad "production build (see /tmp/ap-check-build.log)"; fi

head_ "2. Production server"
npm run start -- -p "$PORT" >/tmp/ap-check-server.log 2>&1 &
SERVER_PID=$!
READY=0
for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:$PORT/" -o /tmp/ap-check-home.html 2>/dev/null; then READY=1; break; fi
  sleep 0.5
done
if [ "$READY" = "1" ]; then ok "server listening on :$PORT"; else bad "server did not start (see /tmp/ap-check-server.log)"; fi
if grep -q "ActionProof" /tmp/ap-check-home.html 2>/dev/null; then ok "console HTML served"; else bad "console HTML missing"; fi

if [ "$READY" = "1" ]; then
  head_ "3. API — valid sample (expect PASS)"
  BODY=$(node -e "const c=require('./$SAMPLE/contract.json');const e=require('./$SAMPLE/evidence-pass.json');process.stdout.write(JSON.stringify({contract:c,evidence:e}))")
  CODE=$(curl -s -o /tmp/ap-check-pass.json -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/verify" -H 'content-type: application/json' -d "$BODY")
  STATUS=$(node -e "try{process.stdout.write(require('/tmp/ap-check-pass.json').result.status)}catch(e){process.stdout.write('none')}")
  if [ "$CODE" = "200" ] && [ "$STATUS" = "PASS" ]; then ok "valid sample -> 200 PASS"; else bad "valid sample -> HTTP $CODE status $STATUS"; fi

  head_ "4. API — adversarial sample (expect DRIFT)"
  BODY2=$(node -e "const c=require('./$SAMPLE/contract.json');const e=require('./$SAMPLE/evidence-false-success.json');process.stdout.write(JSON.stringify({contract:c,evidence:e}))")
  CODE=$(curl -s -o /tmp/ap-check-drift.json -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/verify" -H 'content-type: application/json' -d "$BODY2")
  STATUS=$(node -e "try{process.stdout.write(require('/tmp/ap-check-drift.json').result.status)}catch(e){process.stdout.write('none')}")
  REASON=$(node -e "try{const r=require('/tmp/ap-check-drift.json').result;process.stdout.write(r.reasonCodes.join(','))}catch(e){process.stdout.write('')}")
  if [ "$CODE" = "200" ] && [ "$STATUS" = "DRIFT" ]; then ok "false-success sample -> 200 DRIFT ($REASON)"; else bad "false-success sample -> HTTP $CODE status $STATUS"; fi

  head_ "5. API — failure paths (fail closed)"
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/verify" -H 'content-type: application/json' -d '{ not json')
  [ "$CODE" = "400" ] && ok "malformed JSON -> 400" || bad "malformed JSON -> $CODE (expected 400)"
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/verify" -H 'content-type: application/json' -d '{"contract":{"schema":"actionproof.contract/v1"},"evidence":{}}')
  [ "$CODE" = "422" ] && ok "schema-invalid input -> 422" || bad "schema-invalid input -> $CODE (expected 422)"
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/verify" -H 'content-type: application/json' -d "{\"contract\":$(head -c 600000 /dev/zero | tr '\0' 'x'),\"evidence\":{}}")
  [ "$CODE" = "413" ] && ok "oversized body -> 413" || bad "oversized body -> $CODE (expected 413)"
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X GET "http://127.0.0.1:$PORT/api/verify")
  [ "$CODE" = "405" ] && ok "GET on POST-only endpoint -> 405" || bad "GET /api/verify -> $CODE (expected 405)"
fi

head_ "6. Offline CLI (same sample, no server)"
if npm run verify:offline -- "$SAMPLE/contract.json" "$SAMPLE/evidence-pass.json" >/tmp/ap-check-cli-pass.log 2>&1; then
  ok "CLI valid sample -> exit 0 PASS"
else
  bad "CLI valid sample -> exit $? (see /tmp/ap-check-cli-pass.log)"
fi
npm run verify:offline -- "$SAMPLE/contract.json" "$SAMPLE/evidence-false-success.json" >/tmp/ap-check-cli-drift.log 2>&1
if [ $? -eq 1 ]; then ok "CLI adversarial sample -> exit 1 (verdict not PASS)"; else bad "CLI adversarial sample -> unexpected exit code"; fi
npm run verify:offline -- /tmp/does-not-exist.json "$SAMPLE/evidence-pass.json" >/dev/null 2>&1
if [ $? -eq 2 ]; then ok "CLI missing file -> exit 2 (invalid input)"; else bad "CLI missing file -> unexpected exit code"; fi

if [ "$READY" = "1" ]; then
  kill "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
fi

printf '\n\033[1mResult: %d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
