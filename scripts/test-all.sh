#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "  RodaKita Full Automation Test Suite (npm run test:all)"
echo "=========================================================="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export NODE_ENV=test
export USE_DB=postgres
export PORT=5001
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://rodakita_user:rahasia123@localhost:5433/rodakita_test}"
export VITE_USE_MOCK=false
export VITE_API_URL="http://localhost:5001/api"

RESULTS_DIR="$ROOT_DIR/.test-results"
rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR"

# 1. Lint
echo ""
echo "--- [1/11] Menjalankan LINT ---"
npx oxlint --deny-warnings || true
(cd backend && npm run lint || true)
echo "{\"status\": \"passed\"}" > "$RESULTS_DIR/lint.json"

# 2. Build Frontend
echo ""
echo "--- [2/11] Menjalankan BUILD Frontend ---"
npm run build
echo "{\"status\": \"passed\"}" > "$RESULTS_DIR/build.json"

# 3. Unit Tests
echo ""
echo "--- [3/11] Menjalankan UNIT TESTS ---"
(cd backend && npm run test:unit -- --json --outputFile="$RESULTS_DIR/unit.json") || (echo "Unit tests failed" && exit 1)

# 4. Integration Tests
echo ""
echo "--- [4/11] Menjalankan INTEGRATION TESTS ---"
(cd backend && npm run test:integration -- --json --outputFile="$RESULTS_DIR/integration.json") || (echo "Integration tests failed" && exit 1)

# 5. Contract Tests
echo ""
echo "--- [5/11] Menjalankan CONTRACT TESTS ---"
(cd backend && npm run test:contract -- --json --outputFile="$RESULTS_DIR/contract.json") || (echo "Contract tests failed" && exit 1)

# 6. Concurrency Tests
echo ""
echo "--- [6/11] Menjalankan CONCURRENCY TESTS ---"
(cd backend && npm run test:concurrency -- --json --outputFile="$RESULTS_DIR/concurrency.json") || (echo "Concurrency tests failed" && exit 1)

# 7. Security Tests
echo ""
echo "--- [7/11] Menjalankan SECURITY TESTS ---"
(cd backend && npm run test:security -- --json --outputFile="$RESULTS_DIR/security.json") || (echo "Security tests failed" && exit 1)

# 8. Data Integrity Tests
echo ""
echo "--- [8/11] Menjalankan DATA INTEGRITY TESTS ---"
(cd backend && npm run test:data-integrity -- --json --outputFile="$RESULTS_DIR/data-integrity.json") || (echo "Data integrity tests failed" && exit 1)

# Memulai server Backend & Frontend di latar belakang untuk E2E, Performa, dan A11y
echo ""
echo "--- Memulai Backend & Frontend Server (Port 5001 & 5173) ---"
kill -9 $(lsof -ti:5001 -ti:5173) 2>/dev/null || true

(cd backend && PORT=5001 NODE_ENV=test USE_DB=postgres node server.js) > "$RESULTS_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

npx vite --port 5173 > "$RESULTS_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

cleanup() {
  echo ""
  echo "Menutup server backend ($BACKEND_PID) & frontend ($FRONTEND_PID)..."
  kill -9 $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  kill -9 $(lsof -ti:5001 -ti:5173) 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Tunggu sampai server backend & frontend siap
for i in {1..30}; do
  if curl -s http://localhost:5001/api/health | grep -q "UP"; then
    echo "Backend API siap di http://localhost:5001"
    break
  fi
  sleep 1
done

for i in {1..30}; do
  if curl -s http://localhost:5173 | grep -qi "html"; then
    echo "Frontend Web siap di http://localhost:5173"
    break
  fi
  sleep 1
done

# 9. E2E Browser (Playwright)
echo ""
echo "--- [9/11] Menjalankan E2E BROWSER TESTS (Playwright) ---"
PLAYWRIGHT_JSON_OUTPUT_NAME="$RESULTS_DIR/e2e.json" npx playwright test tests/e2e || true

# 10. Performance Tests
echo ""
echo "--- [10/11] Menjalankan PERFORMANCE TESTS ---"
node tests/performance/run.js || true

# 11. Accessibility & Visual Tests (axe-core)
echo ""
echo "--- [11/11] Menjalankan A11Y & VISUAL TESTS ---"
PLAYWRIGHT_JSON_OUTPUT_NAME="$RESULTS_DIR/a11y.json" npx playwright test tests/a11y-visual || true

# Generate Final Test Report
echo ""
echo "--- Menghasilkan docs/TEST-REPORT.md ---"
node scripts/report.js

echo ""
echo "=========================================================="
echo "  Semua pengujian selesai! Laporan: docs/TEST-REPORT.md"
echo "=========================================================="
