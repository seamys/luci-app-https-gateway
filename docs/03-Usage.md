# Usage Guide

Day-to-day operations for managing your HTTPS gateway after initial setup.

## LuCI Web Interface

Navigate to **Services → HTTPS Gateway** in your OpenWrt LuCI panel.

### Overview Page

The dashboard shows:

- **Service Status**: Running/Stopped indicator
- **nginx Status**: Whether the reverse proxy is active
- **Proxy Rules**: Number of active rules
- **Certificate Status**: Table showing each domain, validity, and expiry date

**Actions available**:

| Button | Effect |
|--------|--------|
| Test nginx Config | Runs `nginx -t` and shows pass/fail |
| Issue/Renew Certificates | Triggers ACME issuance for all enabled certs (3-5 min) |
| Reload Configuration | Re-applies all settings (regenerates nginx conf, syncs DNS) |

### Certificates Page

Add, edit, or remove TLS certificates.

- Click **Add Certificate** to create a new entry
- Set domain (individual or wildcard `*.example.com`)
- Choose key type (EC 256 recommended for performance)
- Toggle enabled/disabled per certificate

### Proxy Rules Page

Add, edit, reorder, or remove reverse proxy rules.

- Click **Add Proxy Rule** to create a new entry
- Fill in: name, domain, path, upstream address
- Enable WebSocket if the backend uses it (Home Assistant, Jellyfin, etc.)
- Rules are applied in order; more specific paths should come first

## Command Line Operations

### Check Service Status

```sh
https-gateway status
```

Output example:
```
Service: running
nginx: active
Certificates:
  *.example.com  valid  expires=2025-03-15  key=ec-256
Proxies:
  nas.example.com /  -> http://192.168.0.100:5000
  ha.example.com  /  -> http://192.168.0.200:8123 [ws]
```

### Apply Configuration

```sh
https-gateway apply
```

This performs:
1. Validates all UCI settings
2. Generates `/etc/nginx/conf.d/https-gateway.conf`
3. Syncs ACME certificate configuration
4. Updates dnsmasq if `auto_dns` is enabled
5. Moves uhttpd off port 80/443
6. Reloads nginx and dnsmasq

### Issue Certificates

```sh
https-gateway issue
```

Triggers certificate issuance/renewal for all enabled certs. This can take 3-5 minutes due to DNS propagation wait.

### Test Configuration

```sh
https-gateway test
```

Validates the generated nginx configuration without applying it.

## Common Workflows

### Add a New LAN Service

1. **Ensure certificate coverage** — If using `*.example.com`, any subdomain is already covered
2. **Add proxy rule** via LuCI or CLI:
   ```sh
   uci add https_gateway proxy
   uci set https_gateway.@proxy[-1].enabled='1'
   uci set https_gateway.@proxy[-1].name='Grafana'
   uci set https_gateway.@proxy[-1].domain='grafana.example.com'
   uci set https_gateway.@proxy[-1].location='/'
   uci set https_gateway.@proxy[-1].upstream='http://192.168.0.50:3000'
   uci commit https_gateway
   ```
3. **Apply**:
   ```sh
   https-gateway apply
   ```
4. **Test**: Open `https://grafana.example.com` from a LAN device

### Switch from Staging to Production Certificates

1. Verify staging certs work (browser shows "not trusted" but connection succeeds)
2. Disable staging:
   ```sh
   uci set https_gateway.global.staging='0'
   uci commit https_gateway
   ```
3. Re-issue certificates:
   ```sh
   https-gateway issue
   ```
4. Wait 3-5 minutes, then verify browser shows trusted certificate

### Temporarily Disable a Service

```sh
# Disable one proxy rule
uci set https_gateway.@proxy[2].enabled='0'
uci commit https_gateway
https-gateway apply
```

### Change DNS Provider

```sh
uci set https_gateway.global.dns_provider='dns_cf'
uci set https_gateway.global.dns_credentials='CF_Key="..." CF_Email="user@example.com"'
uci commit https_gateway
# Re-issue certs with new provider
https-gateway issue
```

## Automatic Behaviors

| Feature | Trigger | Effect |
|---------|---------|--------|
| Certificate renewal | cron (weekly) | Auto-renews certs expiring within 30 days |
| DNS sync | `apply` command | Adds/removes dnsmasq address entries |
| uhttpd port swap | enable/disable gateway | Moves uhttpd to 8080/8443 or restores 80/443 |
| nginx reload | config change | Graceful reload, no downtime |

## Accessing the Router Admin Panel

When the gateway is enabled, uhttpd (LuCI) moves to port 8080/8443:

- HTTP: `http://192.168.0.1:8080`
- HTTPS: `https://192.168.0.1:8443`

Or, if you've configured a proxy rule for the router itself:

- `https://router.example.com` → `http://127.0.0.1:8080`
