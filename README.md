# luci-app-https-gateway

LAN HTTPS reverse proxy gateway — OpenWrt 25.x LuCI application

Manage nginx reverse proxy, automatic ACME certificate issuance, and local DNS resolution through a web UI, providing HTTPS access for LAN services.

## Features

- **Multi-domain management** — Add domains freely, each with an automatically issued TLS certificate
- **Wildcard certificates** — Support `*.example.com`, one certificate covers all subdomains
- **Reverse proxy** — Proxy any HTTP service on LAN or public networks
- **WebSocket support** — One-click Upgrade header injection
- **Automatic DNS** — Automatically add domain → router IP resolution in dnsmasq
- **Auto certificate renewal** — Based on acme-acmesh, 90-day certificates auto-renew
- **LuCI integration** — Three-page UI: status overview, certificate management, proxy rules

## Requirements

- OpenWrt 25.x (APK package manager)
- A domain name + DNS provider API access

## Dependencies

Auto-installed: `nginx-ssl` `acme-acmesh` `acme-acmesh-dnsapi` `curl` `ca-bundle` `ca-certificates`

## Project Structure

```
├── Makefile           OpenWrt SDK build definition
├── src/
│   ├── view/          LuCI JS frontend views (i18n via _())
│   ├── bin/           Main service script → /usr/sbin/https-gateway
│   ├── rpcd/          RPC backend → /usr/libexec/rpcd/https-gateway
│   ├── config/        UCI default config → /etc/config/https_gateway
│   ├── init/          procd init → /etc/init.d/https_gateway
│   ├── uci-defaults/  First-boot script → /etc/uci-defaults/
│   ├── share/         LuCI menu + ACL JSON
│   └── i18n/          Translation files (POT + PO)
│       ├── templates/ POT template (source strings)
│       └── zh_Hans/   Chinese Simplified translation
├── docs/              Documentation
└── tests/             Tests
```

## Installation

### Manual Deployment (Development/Debug)

```sh
ROUTER=root@192.168.0.1

scp src/bin/https-gateway          ${ROUTER}:/usr/sbin/
scp src/rpcd/https-gateway         ${ROUTER}:/usr/libexec/rpcd/
scp src/config/https_gateway       ${ROUTER}:/etc/config/
scp src/init/https_gateway         ${ROUTER}:/etc/init.d/
scp src/uci-defaults/50-luci-https-gateway ${ROUTER}:/etc/uci-defaults/
scp src/share/menu.d/luci-app-https-gateway.json ${ROUTER}:/usr/share/luci/menu.d/
scp src/share/acl.d/luci-app-https-gateway.json  ${ROUTER}:/usr/share/rpcd/acl.d/

ssh ${ROUTER} 'mkdir -p /www/luci-static/resources/view/https-gateway'
scp src/view/*.js ${ROUTER}:/www/luci-static/resources/view/https-gateway/

ssh ${ROUTER} 'chmod +x /usr/sbin/https-gateway /usr/libexec/rpcd/https-gateway /etc/init.d/https_gateway'
ssh ${ROUTER} '/etc/init.d/rpcd restart && /etc/init.d/https_gateway enable'
```

### ImageBuilder Built-in

```sh
cp src/bin/https-gateway           files/usr/sbin/
cp src/rpcd/https-gateway          files/usr/libexec/rpcd/
cp src/config/https_gateway        files/etc/config/
cp src/init/https_gateway          files/etc/init.d/
cp src/uci-defaults/50-luci-https-gateway files/etc/uci-defaults/
cp src/share/menu.d/*.json         files/usr/share/luci/menu.d/
cp src/share/acl.d/*.json          files/usr/share/rpcd/acl.d/
mkdir -p files/www/luci-static/resources/view/https-gateway
cp src/view/*.js                   files/www/luci-static/resources/view/https-gateway/
```

### APK Package Install (After SDK Build)

```sh
apk add --allow-untrusted luci-app-https-gateway_0.1.0-1_all.apk
```

## Quick Configuration

1. Navigate to LuCI → Services → HTTPS Gateway
2. Enter email, select DNS provider, fill in API credentials
3. Add a certificate (e.g. `*.example.com`)
4. Add proxy rules (domain + path + upstream address)
5. Enable gateway → Save & Apply
6. Click "Issue/Renew Certificates"

## Release

To create a new release:

```sh
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions will automatically package `src/` + `Makefile` into a source tarball and publish a GitHub Release with auto-generated release notes.

The tarball can be extracted into the OpenWrt SDK `package/` directory for building.

## License

MIT
