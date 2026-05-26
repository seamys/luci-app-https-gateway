#!/bin/sh
# Mock layer for UCI, ubus, and system commands
# Allows tests to run on any dev machine without OpenWrt.

MOCK_DIR="${TEST_TMPDIR:-/tmp/https-gateway-test}"
MOCK_UCI_DIR="${MOCK_DIR}/uci"
MOCK_FILES_DIR="${MOCK_DIR}/files"

# --- Setup/Teardown ---

mock_setup() {
	rm -rf "$MOCK_DIR"
	mkdir -p "$MOCK_UCI_DIR" "$MOCK_FILES_DIR"
	mkdir -p "${MOCK_DIR}/bin"

	# Create mock commands
	_create_mock_uci
	_create_mock_nginx
	_create_mock_pidof
	_create_mock_logger
	_create_mock_openssl

	# Prepend mock bin to PATH
	export PATH="${MOCK_DIR}/bin:$PATH"
	export MOCK_DIR MOCK_UCI_DIR MOCK_FILES_DIR
}

mock_teardown() {
	rm -rf "$MOCK_DIR"
}

# --- UCI Mock ---
# Stores key=value pairs in flat files under MOCK_UCI_DIR

_create_mock_uci() {
	cat > "${MOCK_DIR}/bin/uci" <<'MOCK_EOF'
#!/bin/sh
# Minimal UCI mock: supports get, set, add, add_list, delete, commit, batch

UCI_DIR="${MOCK_UCI_DIR}"

_get_file() {
	echo "${UCI_DIR}/$(echo "$1" | cut -d. -f1)"
}

case "$1" in
	-q)
		shift
		# Handle -q flag (quiet)
		case "$1" in
			get)
				shift
				local file=$(_get_file "$1")
				local key="$1"
				[ -f "$file" ] && grep "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2-
				;;
			set)
				shift
				local file=$(_get_file "$1")
				local key=$(echo "$1" | cut -d= -f1)
				local val=$(echo "$1" | cut -d= -f2- | tr -d "'")
				mkdir -p "$(dirname "$file")"
				if grep -q "^${key}=" "$file" 2>/dev/null; then
					sed -i "s|^${key}=.*|${key}=${val}|" "$file"
				else
					echo "${key}=${val}" >> "$file"
				fi
				;;
			delete)
				shift
				local file=$(_get_file "$1")
				local key="$1"
				[ -f "$file" ] && sed -i "/^${key}/d" "$file" 2>/dev/null
				;;
			batch)
				# Read heredoc input, execute each line
				while IFS= read -r line; do
					case "$line" in
						set\ *) eval "uci -q $line" ;;
						delete\ *) eval "uci -q $line" ;;
					esac
				done
				;;
			*) ;;
		esac
		;;
	get)
		shift
		local file=$(_get_file "$1")
		local key="$1"
		if [ -f "$file" ] && grep -q "^${key}=" "$file" 2>/dev/null; then
			grep "^${key}=" "$file" | head -1 | cut -d= -f2-
		else
			echo "uci: Entry not found" >&2
			return 1
		fi
		;;
	set)
		shift
		local file=$(_get_file "$1")
		local key=$(echo "$1" | cut -d= -f1)
		local val=$(echo "$1" | cut -d= -f2- | tr -d "'")
		mkdir -p "$(dirname "$file")"
		if grep -q "^${key}=" "$file" 2>/dev/null; then
			sed -i "s|^${key}=.*|${key}=${val}|" "$file"
		else
			echo "${key}=${val}" >> "$file"
		fi
		;;
	add)
		shift
		local config="$1"
		local type="$2"
		local file="${UCI_DIR}/${config}"
		local idx=$(grep -c "^@${type}\[" "$file" 2>/dev/null || echo "0")
		echo "@${type}[${idx}].type=${type}" >> "$file"
		;;
	add_list)
		shift
		local file=$(_get_file "$1")
		local key=$(echo "$1" | cut -d= -f1)
		local val=$(echo "$1" | cut -d= -f2- | tr -d "'")
		echo "${key}[]=${val}" >> "$file"
		;;
	commit)
		# no-op in mock
		;;
	*)
		;;
esac
exit 0
MOCK_EOF
	chmod +x "${MOCK_DIR}/bin/uci"
}

_create_mock_nginx() {
	cat > "${MOCK_DIR}/bin/nginx" <<'MOCK_EOF'
#!/bin/sh
case "$1" in
	-t)
		if [ -f "${MOCK_DIR}/nginx_fail" ]; then
			echo "nginx: configuration file test failed" >&2
			exit 1
		fi
		echo "nginx: the configuration file syntax is ok"
		echo "nginx: configuration file test is successful"
		exit 0
		;;
esac
MOCK_EOF
	chmod +x "${MOCK_DIR}/bin/nginx"
}

_create_mock_pidof() {
	cat > "${MOCK_DIR}/bin/pidof" <<'MOCK_EOF'
#!/bin/sh
if [ -f "${MOCK_DIR}/pidof_${1}" ]; then
	cat "${MOCK_DIR}/pidof_${1}"
	exit 0
fi
exit 1
MOCK_EOF
	chmod +x "${MOCK_DIR}/bin/pidof"
}

_create_mock_logger() {
	cat > "${MOCK_DIR}/bin/logger" <<'MOCK_EOF'
#!/bin/sh
# Store log messages for assertions
echo "$@" >> "${MOCK_DIR}/log"
MOCK_EOF
	chmod +x "${MOCK_DIR}/bin/logger"
}

_create_mock_openssl() {
	cat > "${MOCK_DIR}/bin/openssl" <<'MOCK_EOF'
#!/bin/sh
case "$1" in
	x509)
		if [ -f "${MOCK_DIR}/cert_expiry" ]; then
			echo "notAfter=$(cat "${MOCK_DIR}/cert_expiry")"
		else
			echo "notAfter=Mar 15 12:00:00 2025 GMT"
		fi
		;;
esac
MOCK_EOF
	chmod +x "${MOCK_DIR}/bin/openssl"
}

# --- Helper functions for tests ---

# mock_uci_set <key> <value>
mock_uci_set() {
	local config=$(echo "$1" | cut -d. -f1)
	local file="${MOCK_UCI_DIR}/${config}"
	echo "${1}=${2}" >> "$file"
}

# mock_nginx_fail - make nginx -t return failure
mock_nginx_fail() {
	touch "${MOCK_DIR}/nginx_fail"
}

# mock_nginx_pass - make nginx -t return success (default)
mock_nginx_pass() {
	rm -f "${MOCK_DIR}/nginx_fail"
}

# mock_process_running <name> [pid]
mock_process_running() {
	echo "${2:-1234}" > "${MOCK_DIR}/pidof_${1}"
}

# mock_process_stopped <name>
mock_process_stopped() {
	rm -f "${MOCK_DIR}/pidof_${1}"
}

# mock_cert_file <domain> - create a fake cert file
mock_cert_file() {
	local dir="${MOCK_FILES_DIR}/etc/ssl/acme"
	mkdir -p "$dir"
	touch "${dir}/${1}.fullchain.crt"
	touch "${dir}/${1}.key"
}

# mock_get_log - return captured log output
mock_get_log() {
	cat "${MOCK_DIR}/log" 2>/dev/null || echo ""
}
