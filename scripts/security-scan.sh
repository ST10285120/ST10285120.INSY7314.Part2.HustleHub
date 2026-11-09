#!/usr/bin/env bash
#
# Runs the pipeline's security checks locally (needs Docker and Node):
#   1. npm audit       - known-vulnerable production dependencies (backend + frontend)
#   2. Semgrep (SAST)  - OWASP Top 10, Node.js, React, secrets and Dockerfile rules
#   3. Trivy           - dependency CVEs, hard-coded secrets, Dockerfile misconfiguration
#   4. OWASP ZAP (DAST, optional) - baseline scan of the running app:  --dast
#
# Reports are written to docs/evidence/static-analysis/ so they can be committed
# as evidence. Exits non-zero if any blocking issue is found (same thresholds as CI).
#
#   bash scripts/security-scan.sh            # static checks
#   bash scripts/security-scan.sh --dast     # + ZAP against https://localhost:3000 (stack must be up)

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/evidence/static-analysis"
TRIVY_IMAGE="aquasec/trivy:0.69.3"
SEMGREP_IMAGE="semgrep/semgrep"
ZAP_IMAGE="ghcr.io/zaproxy/zaproxy:stable"
FAILED=()

mkdir -p "$OUT"
cd "$ROOT"

section() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

section "1/4 npm audit (production dependencies, fail on high/critical)"
for app in backend frontend; do
  if (cd "$app" && npm audit --omit=dev --audit-level=high) 2>&1 | tee "$OUT/npm-audit-$app.txt"; then
    echo "-> $app: OK"
  else
    FAILED+=("npm audit ($app)")
  fi
done

section "2/4 Semgrep SAST"
docker run --rm -v "$ROOT:/src" -w /src "$SEMGREP_IMAGE" semgrep scan \
  --config p/javascript --config p/nodejsscan --config p/react \
  --config p/owasp-top-ten --config p/secrets --config p/dockerfile \
  --exclude '**/__tests__/**' --exclude '*.test.js' --exclude '*.test.jsx' \
  --metrics off --sarif --output docs/evidence/static-analysis/semgrep.sarif
if python3 .github/scripts/sarif_gate.py "$OUT/semgrep.sarif" --fail-level error --title "Semgrep" | tee "$OUT/semgrep-summary.md"; then
  echo "-> Semgrep: no blocking findings"
else
  FAILED+=("Semgrep")
fi

section "3/4 Trivy (dependencies, secrets, Dockerfile misconfiguration)"
TRIVY_ARGS=(fs --scanners vuln,secret,misconfig
  --skip-dirs backend/node_modules --skip-dirs frontend/node_modules --skip-dirs frontend/dist)
docker run --rm -v "$ROOT:/src" -w /src "$TRIVY_IMAGE" "${TRIVY_ARGS[@]}" \
  --format table --output docs/evidence/static-analysis/trivy-fs-all.txt . >/dev/null 2>&1
if docker run --rm -v "$ROOT:/src" -w /src "$TRIVY_IMAGE" "${TRIVY_ARGS[@]}" \
  --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 . 2>&1 | tee "$OUT/trivy-fs.txt"; then
  echo "-> Trivy: no fixable HIGH/CRITICAL issues"
else
  FAILED+=("Trivy")
fi

if [[ "${1:-}" == "--dast" ]]; then
  section "4/4 OWASP ZAP baseline (DAST) against https://localhost:3000"
  mkdir -p "$OUT/zap" && chmod 777 "$OUT/zap"
  cp .zap/rules.tsv "$OUT/zap/rules.tsv"
  # host.docker.internal reaches the Mac's localhost from inside Docker Desktop.
  if docker run --rm -v "$OUT/zap:/zap/wrk:rw" "$ZAP_IMAGE" zap-baseline.py \
    -t https://host.docker.internal:3000 -c rules.tsv -I \
    -r zap-report.html -J zap-report.json -w zap-report.md; then
    echo "-> ZAP: no FAIL-level findings"
  else
    FAILED+=("OWASP ZAP")
  fi
else
  section "4/4 OWASP ZAP skipped (run with --dast while docker compose is up)"
fi

section "Summary"
echo "Reports: docs/evidence/static-analysis/"
if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo "All security checks passed."
else
  echo "Blocking issues in: ${FAILED[*]}"
  exit 1
fi
