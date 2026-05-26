#!/bin/sh
# Test framework for https-gateway
# Provides assertion helpers and test runner.
# Compatible with POSIX sh / busybox ash.

# --- Test state ---
_TESTS_RUN=0
_TESTS_PASS=0
_TESTS_FAIL=0
_CURRENT_TEST=""
_FAILURES=""

# --- Colors (if terminal supports) ---
if [ -t 1 ]; then
	_GREEN='\033[0;32m'
	_RED='\033[0;31m'
	_YELLOW='\033[0;33m'
	_BOLD='\033[1m'
	_RESET='\033[0m'
else
	_GREEN='' _RED='' _YELLOW='' _BOLD='' _RESET=''
fi

# --- Assertions ---

# assert_equal <expected> <actual> [description]
assert_equal() {
	_TESTS_RUN=$((_TESTS_RUN + 1))
	if [ "$1" = "$2" ]; then
		_TESTS_PASS=$((_TESTS_PASS + 1))
		printf "    ${_GREEN}✓${_RESET} %s\n" "${3:-values equal}"
	else
		_TESTS_FAIL=$((_TESTS_FAIL + 1))
		printf "    ${_RED}✗${_RESET} %s\n" "${3:-values equal}"
		printf "      expected: '%s'\n" "$1"
		printf "      actual:   '%s'\n" "$2"
		_FAILURES="${_FAILURES}\n  - [${_CURRENT_TEST}] ${3:-values equal}"
	fi
}

# assert_not_equal <unexpected> <actual> [description]
assert_not_equal() {
	_TESTS_RUN=$((_TESTS_RUN + 1))
	if [ "$1" != "$2" ]; then
		_TESTS_PASS=$((_TESTS_PASS + 1))
		printf "    ${_GREEN}✓${_RESET} %s\n" "${3:-values not equal}"
	else
		_TESTS_FAIL=$((_TESTS_FAIL + 1))
		printf "    ${_RED}✗${_RESET} %s\n" "${3:-values not equal}"
		printf "      unexpected: '%s'\n" "$1"
		_FAILURES="${_FAILURES}\n  - [${_CURRENT_TEST}] ${3:-values not equal}"
	fi
}

# assert_true <command...> [description is last arg if starts with #]
assert_true() {
	local desc=""
	# Check if last argument is a description (starts with #)
	eval "local _last=\${$#}"
	case "$_last" in
		\#*) desc="${_last#\#}"; set -- $(echo "$@" | sed "s| ${_last}$||") ;;
	esac

	_TESTS_RUN=$((_TESTS_RUN + 1))
	if "$@" >/dev/null 2>&1; then
		_TESTS_PASS=$((_TESTS_PASS + 1))
		printf "    ${_GREEN}✓${_RESET} %s\n" "${desc:-command succeeds: $*}"
	else
		_TESTS_FAIL=$((_TESTS_FAIL + 1))
		printf "    ${_RED}✗${_RESET} %s\n" "${desc:-command succeeds: $*}"
		_FAILURES="${_FAILURES}\n  - [${_CURRENT_TEST}] ${desc:-$*}"
	fi
}

# assert_false <command...>
assert_false() {
	local desc=""
	eval "local _last=\${$#}"
	case "$_last" in
		\#*) desc="${_last#\#}"; set -- $(echo "$@" | sed "s| ${_last}$||") ;;
	esac

	_TESTS_RUN=$((_TESTS_RUN + 1))
	if ! "$@" >/dev/null 2>&1; then
		_TESTS_PASS=$((_TESTS_PASS + 1))
		printf "    ${_GREEN}✓${_RESET} %s\n" "${desc:-command fails: $*}"
	else
		_TESTS_FAIL=$((_TESTS_FAIL + 1))
		printf "    ${_RED}✗${_RESET} %s\n" "${desc:-command fails: $*}"
		_FAILURES="${_FAILURES}\n  - [${_CURRENT_TEST}] ${desc:-$*}"
	fi
}

# assert_contains <haystack> <needle> [description]
assert_contains() {
	_TESTS_RUN=$((_TESTS_RUN + 1))
	if echo "$1" | grep -qF "$2"; then
		_TESTS_PASS=$((_TESTS_PASS + 1))
		printf "    ${_GREEN}✓${_RESET} %s\n" "${3:-output contains '$2'}"
	else
		_TESTS_FAIL=$((_TESTS_FAIL + 1))
		printf "    ${_RED}✗${_RESET} %s\n" "${3:-output contains '$2'}"
		printf "      needle: '%s'\n" "$2"
		printf "      haystack (first 200 chars): '%.200s'\n" "$1"
		_FAILURES="${_FAILURES}\n  - [${_CURRENT_TEST}] ${3:-contains '$2'}"
	fi
}

# assert_not_contains <haystack> <needle> [description]
assert_not_contains() {
	_TESTS_RUN=$((_TESTS_RUN + 1))
	if ! echo "$1" | grep -qF "$2"; then
		_TESTS_PASS=$((_TESTS_PASS + 1))
		printf "    ${_GREEN}✓${_RESET} %s\n" "${3:-output does not contain '$2'}"
	else
		_TESTS_FAIL=$((_TESTS_FAIL + 1))
		printf "    ${_RED}✗${_RESET} %s\n" "${3:-output does not contain '$2'}"
		_FAILURES="${_FAILURES}\n  - [${_CURRENT_TEST}] ${3:-not contains '$2'}"
	fi
}

# assert_match <text> <regex> [description]
assert_match() {
	_TESTS_RUN=$((_TESTS_RUN + 1))
	if echo "$1" | grep -qE "$2"; then
		_TESTS_PASS=$((_TESTS_PASS + 1))
		printf "    ${_GREEN}✓${_RESET} %s\n" "${3:-matches /$2/}"
	else
		_TESTS_FAIL=$((_TESTS_FAIL + 1))
		printf "    ${_RED}✗${_RESET} %s\n" "${3:-matches /$2/}"
		printf "      text: '%s'\n" "$1"
		_FAILURES="${_FAILURES}\n  - [${_CURRENT_TEST}] ${3:-matches /$2/}"
	fi
}

# assert_file_exists <path> [description]
assert_file_exists() {
	_TESTS_RUN=$((_TESTS_RUN + 1))
	if [ -f "$1" ]; then
		_TESTS_PASS=$((_TESTS_PASS + 1))
		printf "    ${_GREEN}✓${_RESET} %s\n" "${2:-file exists: $1}"
	else
		_TESTS_FAIL=$((_TESTS_FAIL + 1))
		printf "    ${_RED}✗${_RESET} %s\n" "${2:-file exists: $1}"
		_FAILURES="${_FAILURES}\n  - [${_CURRENT_TEST}] ${2:-file exists: $1}"
	fi
}

# assert_exit_code <expected_code> <command...>
assert_exit_code() {
	local expected="$1"; shift
	_TESTS_RUN=$((_TESTS_RUN + 1))
	"$@" >/dev/null 2>&1
	local actual=$?
	if [ "$actual" -eq "$expected" ]; then
		_TESTS_PASS=$((_TESTS_PASS + 1))
		printf "    ${_GREEN}✓${_RESET} exit code %d: %s\n" "$expected" "$*"
	else
		_TESTS_FAIL=$((_TESTS_FAIL + 1))
		printf "    ${_RED}✗${_RESET} exit code expected %d, got %d: %s\n" "$expected" "$actual" "$*"
		_FAILURES="${_FAILURES}\n  - [${_CURRENT_TEST}] exit $expected: $*"
	fi
}

# --- Test runner ---

# describe <suite_name>
describe() {
	printf "\n${_BOLD}%s${_RESET}\n" "$1"
}

# it <test_name>
it() {
	_CURRENT_TEST="$1"
	printf "  ${_YELLOW}•${_RESET} %s\n" "$1"
}

# Print final summary
test_summary() {
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	if [ "$_TESTS_FAIL" -eq 0 ]; then
		printf "${_GREEN}${_BOLD}All %d tests passed${_RESET}\n" "$_TESTS_RUN"
	else
		printf "${_RED}${_BOLD}%d of %d tests failed${_RESET}\n" "$_TESTS_FAIL" "$_TESTS_RUN"
		printf "\nFailures:${_RED}%b${_RESET}\n" "$_FAILURES"
	fi
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	[ "$_TESTS_FAIL" -eq 0 ]
}
