# luci-app-https-gateway — Agent Instructions

OpenWrt 25.x LuCI application: nginx reverse proxy + ACME certificate management + dnsmasq DNS automation.  
See [README.md](README.md) for feature overview, installation, and project structure.

## Build & Test

```sh
# Run validation regex tests (no router required)
bash tests/test_validate.sh

# Build APK package (requires OpenWrt SDK)
make -C /path/to/openwrt package/luci-app-https-gateway/compile

# Deploy files directly to a router for live testing
ROUTER=root@192.168.0.1
# See README.md § Manual Deployment for the full scp/ssh sequence
```

## CI / Release

GitHub Actions workflow at `.github/workflows/release.yml`:
- Triggers on pushing a `v*` tag (e.g. `git tag v0.2.0 && git push origin v0.2.0`).
- Packages `src/` + `Makefile` into a source tarball suitable for the OpenWrt SDK `package/` directory.
- Creates a GitHub Release with auto-generated release notes and the tarball attached.

## Architecture

Five layers interact at runtime:

| Layer | File(s) | Role |
|---|---|---|
| LuCI views | `src/view/*.js` | Browser UI; reads UCI via forms, calls rpcd via `rpc.declare()` |
| rpcd backend | `src/rpcd/https-gateway` | Protocol adapter; dispatches to the main binary |
| Main binary | `src/bin/https-gateway` | All business logic: nginx conf, ACME sync, DNS sync, uhttpd migration |
| UCI config | `src/config/https_gateway` | Source of truth for all settings (section types: `gateway`, `certificate`, `proxy`) |
| Init script | `src/init/https_gateway` | procd service; triggers `https-gateway apply` on every UCI save |

Data flow on every "Save & Apply": UCI commit → `procd_add_reload_trigger` → `https-gateway apply` → rewrites nginx conf, ACME config, dnsmasq entries.

## Key Conventions

### Shell scripts (`src/bin/`, `src/rpcd/`, `src/init/`)
- **POSIX sh only** (`#!/bin/sh`), no bash. busybox ash compatible.
- Constants in `UPPER_SNAKE_CASE`; functions named with verbs; private helpers prefixed `_`.
- JSON produced via `. /usr/share/libubox/jshn.sh` + `json_init` / `json_add_*` / `json_dump`.
- UCI access via `config_load` / `config_get` / `config_foreach` (never parse raw uci output).
- `config_foreach` callbacks **must not run in a subshell** (pipe/`$()`); they modify outer-scope variables that would be silently lost.
- `uci batch` heredoc for bulk UCI writes.

### LuCI views (`src/view/*.js`)
- ES5 strict mode; LuCI module system (`'require view'`, `'require form'`, `'require rpc'`).
- DOM via `E(tag, attrs, children)` — no frameworks, no template literals.
- Translation via bare `_('...')` — every user-visible string must be in the POT/PO.
- Forms use `form.Map` / `form.TypedSection` / `form.NamedSection`.
- `o.validate` JS functions must stay **identical** to the shell `validate_*` regexes in `src/bin/https-gateway` and the regex literals in `tests/test_validate.sh` — there is no single source of truth, keep all three in sync manually.

### rpcd (`src/rpcd/https-gateway`)
- `list` method returns JSON method signatures; `call` dispatches to `method_*` functions.
- Async operations fork a background subshell `( ... ) &` and write a PID file; the LuCI view polls `cert_status` every 5 s until state leaves `running`.

### UCI section types
| Section | Type name | Access pattern |
|---|---|---|
| Global settings | `gateway` | `config_get enabled global enabled '0'` |
| Certificates | `certificate` | `config_foreach` |
| Proxy rules | `proxy` | `config_foreach` |

Getting the type name wrong causes silent empty reads — double-check with `grep '^config' src/config/https_gateway`.

## Critical Pitfalls

- **`use_staging '1'` default** — staging mode is ON by default. Deployments that skip disabling this get browser-rejected Let's Encrypt staging certificates with no clear UI error.
- **Destructive ACME sync** — `sync_acme()` wipes all `@cert[-1]` entries before rebuilding from `https_gateway` config. Never manipulate `/etc/config/acme` cert sections independently.
- **uhttpd side-effect** — `setup_uhttpd()` permanently moves LuCI to `127.0.0.1:8080`. If nginx fails after this, LuCI becomes unreachable over LAN. `stop_service()` restores it only if the pattern is already present.
- **Wildcard cert paths** — `get_cert_path()` checks three naming patterns: `domain.fullchain.crt`, `*.domain.fullchain.crt`, `_wildcard.domain.fullchain.crt`. Handle all three consistently when modifying cert logic.
- **rpcd JSON safety** — `cert_status` manually replaces `"` → `'` and `\n` → `|` in log output. Other JSON-unsafe chars can break the output; improve escaping if log content changes.

## i18n Workflow

1. Add string to a view JS file using `_('New string')`.
2. Add corresponding `msgid` entry to `src/i18n/templates/https-gateway.pot`.
3. Add translated `msgstr` to `src/i18n/zh_Hans/https-gateway.po`.
4. Build step runs `po2lmo` → `.lmo` binary in `/usr/share/luci/i18n/`.

There is no automated string extraction; POT is maintained manually.

## ACL
- Read: `status`, `cert_status`, `nginx_test` + UCI read of `https_gateway`.
- Write: `cert_issue` + UCI write of `https_gateway`.
- The entire LuCI menu is hidden without the `luci-app-https-gateway` ACL grant.
