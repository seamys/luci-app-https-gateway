#!/bin/sh
# Unit tests: DNS sync and certificate path logic

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "${SCRIPT_DIR}/framework.sh"

# --- Functions under test ---

# get_cert_path logic (adapted for testing without filesystem)
# Uses CERT_BASE as configurable root
CERT_BASE="${TEST_TMPDIR:-/tmp/https-gateway-test-certs}"

setup_cert_dir() {
	rm -rf "$CERT_BASE"
	mkdir -p "$CERT_BASE"
}

get_cert_path() {
	local domain="$1"
	if [ -f "${CERT_BASE}/${domain}.fullchain.crt" ]; then
		echo "${CERT_BASE}/${domain}"
		return 0
	fi
	local stripped="${domain#\*.}"
	if [ -f "${CERT_BASE}/*.${stripped}.fullchain.crt" ]; then
		echo "${CERT_BASE}/*.${stripped}"
		return 0
	fi
	if [ -f "${CERT_BASE}/_wildcard.${stripped}.fullchain.crt" ]; then
		echo "${CERT_BASE}/_wildcard.${stripped}"
		return 0
	fi
	echo "${CERT_BASE}/${domain}"
	return 1
}

# DNS domain collection logic
collect_dns_domains() {
	local domains="$1"  # space-separated list of "domain:enabled" pairs
	local managed=""

	for entry in $domains; do
		local domain="${entry%%:*}"
		local enabled="${entry##*:}"

		[ "$enabled" = "1" ] || continue
		[ -n "$domain" ] || continue

		# Skip wildcards for DNS
		case "$domain" in
			\*.*) continue ;;
		esac

		# Deduplicate
		case " $managed " in
			*" $domain "*) ;;
			*) managed="$managed $domain" ;;
		esac
	done

	echo "$managed"
}

# Wildcard matching logic
wildcard_covers_domain() {
	local cert_domain="$1"
	local target_domain="$2"

	case "$cert_domain" in
		\*.*)
			local wildcard_base="${cert_domain#\*.}"
			local target_base="${target_domain#*.}"
			if [ "$wildcard_base" = "$target_base" ] || [ "$wildcard_base" = "$target_domain" ]; then
				return 0
			fi
			;;
	esac
	return 1
}

# ============================================================
describe "get_cert_path"
# ============================================================

setup_cert_dir

it "finds direct domain cert"
touch "${CERT_BASE}/nas.example.com.fullchain.crt"
RESULT=$(get_cert_path "nas.example.com")
assert_equal "${CERT_BASE}/nas.example.com" "$RESULT" "direct path match"
assert_exit_code 0 get_cert_path "nas.example.com"

it "finds wildcard cert with asterisk naming"
touch "${CERT_BASE}/*.example.com.fullchain.crt"
RESULT=$(get_cert_path "*.example.com")
assert_equal "${CERT_BASE}/*.example.com" "$RESULT" "wildcard asterisk path"

it "finds wildcard cert with _wildcard naming"
rm -f "${CERT_BASE}/*.other.com.fullchain.crt"
touch "${CERT_BASE}/_wildcard.other.com.fullchain.crt"
RESULT=$(get_cert_path "*.other.com")
assert_equal "${CERT_BASE}/_wildcard.other.com" "$RESULT" "wildcard underscore path"

it "returns fallback path when cert not found"
RESULT=$(get_cert_path "missing.example.com")
assert_equal "${CERT_BASE}/missing.example.com" "$RESULT" "fallback path"
assert_exit_code 1 get_cert_path "missing.example.com"

it "prefers direct match over wildcard"
touch "${CERT_BASE}/specific.test.com.fullchain.crt"
touch "${CERT_BASE}/*.test.com.fullchain.crt"
RESULT=$(get_cert_path "specific.test.com")
assert_equal "${CERT_BASE}/specific.test.com" "$RESULT" "direct match preferred"

# ============================================================
describe "wildcard certificate matching"
# ============================================================

it "wildcard covers subdomain"
assert_exit_code 0 wildcard_covers_domain "*.example.com" "nas.example.com"

it "wildcard covers deep subdomain's parent"
assert_exit_code 0 wildcard_covers_domain "*.example.com" "app.example.com"

it "wildcard covers base domain"
assert_exit_code 0 wildcard_covers_domain "*.example.com" "example.com"

it "wildcard does not cover different root"
assert_exit_code 1 wildcard_covers_domain "*.example.com" "nas.other.com"

it "wildcard does not cover sub-subdomain"
assert_exit_code 1 wildcard_covers_domain "*.example.com" "a.b.example.com"

it "non-wildcard does not match as wildcard"
assert_exit_code 1 wildcard_covers_domain "example.com" "nas.example.com"

# ============================================================
describe "DNS domain collection"
# ============================================================

it "collects enabled domains"
RESULT=$(collect_dns_domains "nas.example.com:1 ha.example.com:1")
assert_contains "$RESULT" "nas.example.com" "includes nas"
assert_contains "$RESULT" "ha.example.com" "includes ha"

it "skips disabled domains"
RESULT=$(collect_dns_domains "nas.example.com:1 disabled.example.com:0")
assert_contains "$RESULT" "nas.example.com" "includes enabled"
assert_not_contains "$RESULT" "disabled.example.com" "excludes disabled"

it "skips wildcard domains"
RESULT=$(collect_dns_domains "*.example.com:1 nas.example.com:1")
assert_not_contains "$RESULT" "*" "no wildcards in DNS"
assert_contains "$RESULT" "nas.example.com" "includes concrete domain"

it "deduplicates domains"
RESULT=$(collect_dns_domains "nas.example.com:1 nas.example.com:1 nas.example.com:1")
# Count occurrences
COUNT=$(echo "$RESULT" | grep -o "nas.example.com" | wc -l)
assert_equal "1" "$COUNT" "only one occurrence"

it "returns empty for all disabled"
RESULT=$(collect_dns_domains "a.com:0 b.com:0")
TRIMMED=$(echo "$RESULT" | tr -d ' ')
assert_equal "" "$TRIMMED" "empty result"

it "returns empty for all wildcards"
RESULT=$(collect_dns_domains "*.a.com:1 *.b.com:1")
TRIMMED=$(echo "$RESULT" | tr -d ' ')
assert_equal "" "$TRIMMED" "empty for wildcards"

# ============================================================
describe "Certificate domain list for ACME"
# ============================================================

# Test: wildcard certs should include base domain too
build_acme_domains() {
	local domain="$1"
	local domains="$domain"
	case "$domain" in
		\*.*)
			local base="${domain#\*.}"
			domains="$domains $base"
			;;
	esac
	echo "$domains"
}

it "regular domain returns single entry"
RESULT=$(build_acme_domains "nas.example.com")
assert_equal "nas.example.com" "$RESULT" "single domain"

it "wildcard domain includes base domain"
RESULT=$(build_acme_domains "*.example.com")
assert_contains "$RESULT" "*.example.com" "wildcard included"
assert_contains "$RESULT" "example.com" "base domain included"

# ============================================================
# Cleanup
rm -rf "$CERT_BASE"
test_summary
