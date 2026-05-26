#!/bin/sh
# Run all tests in the tests/ directory
# Usage: bash tests/run_all.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOTAL_PASS=0
TOTAL_FAIL=0
FAILED_SUITES=""

echo "╔══════════════════════════════════════════════════╗"
echo "║     https-gateway — Test Suite                   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

for test_file in "${SCRIPT_DIR}"/test_*.sh; do
	[ -f "$test_file" ] || continue

	suite_name=$(basename "$test_file" .sh)
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "Running: ${suite_name}"
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

	if sh "$test_file"; then
		echo ""
	else
		TOTAL_FAIL=$((TOTAL_FAIL + 1))
		FAILED_SUITES="${FAILED_SUITES} ${suite_name}"
		echo ""
	fi
done

echo ""
echo "╔══════════════════════════════════════════════════╗"
if [ "$TOTAL_FAIL" -eq 0 ]; then
	echo "║  ✓ ALL TEST SUITES PASSED                       ║"
else
	echo "║  ✗ SOME TEST SUITES FAILED                      ║"
	echo "║  Failed:${FAILED_SUITES}"
fi
echo "╚══════════════════════════════════════════════════╝"

[ "$TOTAL_FAIL" -eq 0 ]
