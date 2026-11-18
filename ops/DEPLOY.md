# Setpoint — Deployment Handoff

Angular SPA + CouchDB. All configuration is runtime — no rebuild needed
for any deployment change except code.

## What's in this zip

- `app/`                     – the built Angular SPA. Serve as static files.
- `app/app-settings.json`    – runtime configuration (edit on server, no rebuild).
- `couchdb-config/local.ini` – reference CouchDB config, edit before use.
- `DEPLOY.md`                – this file.

## The single-file config

`app/app-settings.json` is loaded by the browser on every page load.
Change values in it → hard-refresh browser → new config is live.
No rebuild, no Node.js, no Angular knowledge.

```json
{
  "appName": "Setpoint",
  "org": "RBH Solutions",
  "tagline": "Weekly SCADA Project Tracker",

  "CouchDB": {
    "ConnectionString": "http://164.52.199.179:5984/",
    "couchIp": "127.0.0.1",
    "port": "5984",
    "DBName": "pmsapp",
    "User": "admin",
    "Password": "rbh@123456",
    "LiveSync": true,
    "LocalDbPrefix": "pmsapp"
  },

  "features": { "legacyImport": false, "auditLog": true, "excelExport": true },
  "limits":   { "maxProjectsPerUser": 50, "auditRetentionDays": 365, "backdatingDaysAllowed": 14 },
  "support":  { "contactEmail": "", "docsUrl": "" }
}
```

### Which fields the code actually reads

| Field                     | Used  | Notes |
|---------------------------|-------|-------|
| `CouchDB.ConnectionString`| ✅    | Source of truth for the CouchDB base URL |
| `CouchDB.couchIp`         | ❌    | Informational — mirrors ConnectionString for team readability |
| `CouchDB.port`            | ❌    | Informational — mirrors ConnectionString for team readability |
| `CouchDB.DBName`          | ✅    | Appended to ConnectionString to form the DB URL |
| `CouchDB.User`            | ✅    | Injected into URL as HTTP Basic auth |
| `CouchDB.Password`        | ✅    | URL-encoded automatically so `@`, `:`, `#` etc. are safe |
| `CouchDB.LiveSync`        | ✅    | Keeps replication open for continuous sync |
| `CouchDB.LocalDbPrefix`   | ✅    | Name of local IndexedDB in each browser |

### Security note

`User` and `Password` in `app-settings.json` are **visible to any user
who loads the app** (View Source / DevTools → Network → app-settings.json).
This is the accepted trade-off for a strict-intranet deployment — same
model as ASP.NET connection strings in `appsettings.json` on an internal
server.

**Do not deploy this configuration to a public URL.** For public
deployments, use a reverse proxy that adds Basic-auth server-side and
leave User/Password blank in this file.

## Server requirements

- Linux VPS (2 vCPU / 4 GB RAM). Ubuntu 22.04 or Debian 12.
- CouchDB 3.4 (via Docker or apt).
- Caddy (recommended, auto-TLS) or Nginx + Certbot.
- ufw firewall.
- A domain with DNS pointing to the server IP.

## Deployment steps

### 1. Static app

Copy `app/*` to `/var/www/setpoint/` on the server. The web server serves
this as site root.

### 2. Point the app at the right CouchDB

Edit `/var/www/setpoint/app-settings.json` on the server — update
`ConnectionString`, `DBName`, `User`, `Password` for the target CouchDB.

### 3. Run CouchDB

Install CouchDB 3.4. Mount `couchdb-config/local.ini` at
`/opt/couchdb/etc/local.d/00-app.ini`.

Before starting, edit `local.ini`:
- `require_valid_user = true`  (currently `false` — dev only)
- `[cors] origins = <your app origin>` (browser origin that will load
  the SPA, e.g. `https://setpoint.rbhsolutions.com`)

On first boot, set the admin password:
```
curl -X PUT http://127.0.0.1:5984/_node/_local/_config/admins/rbh_admin \
     -d '"<strong-password>"'
```

Create the target database:
```
curl -X PUT http://rbh_admin:PASS@127.0.0.1:5984/pmsapp
```

Create a service account and grant it access to the DB:
```
curl -X PUT http://rbh_admin:PASS@127.0.0.1:5984/_users/org.couchdb.user:app_service \
     -H "Content-Type: application/json" \
     -d '{"name":"app_service","password":"<pw>","roles":[],"type":"user"}'

curl -X PUT http://rbh_admin:PASS@127.0.0.1:5984/pmsapp/_security \
     -H "Content-Type: application/json" \
     -d '{"members":{"names":["app_service"],"roles":[]}}'
```

Put `app_service` / `<pw>` into `app-settings.json`.

### 4. Enable CORS on CouchDB

The browser will refuse to talk to CouchDB unless CouchDB explicitly
allows the app's origin. From any machine that can reach the CouchDB:

```
curl -X PUT -u rbh_admin:PASS \
  http://<couchdb>:5984/_node/_local/_config/chttpd/enable_cors -d '"true"'
curl -X PUT -u rbh_admin:PASS \
  http://<couchdb>:5984/_node/_local/_config/cors/origins -d '"<app-origin>"'
curl -X PUT -u rbh_admin:PASS \
  http://<couchdb>:5984/_node/_local/_config/cors/credentials -d '"true"'
curl -X PUT -u rbh_admin:PASS \
  http://<couchdb>:5984/_node/_local/_config/cors/methods -d '"GET, PUT, POST, HEAD, DELETE"'
curl -X PUT -u rbh_admin:PASS \
  http://<couchdb>:5984/_node/_local/_config/cors/headers -d '"accept, authorization, content-type, origin, referer, x-csrf-token"'
```

Where `<app-origin>` is e.g. `https://setpoint.rbhsolutions.com`.

### 5. Reverse proxy (Caddy)

`/etc/caddy/Caddyfile`:

```
setpoint.rbhsolutions.com {
    encode gzip zstd
    root * /var/www/setpoint
    try_files {path} /index.html
    file_server
}
```

Reload: `systemctl reload caddy`. Caddy handles HTTPS automatically.

### 6. Firewall

```
ufw default deny incoming
ufw allow 22 80 443
ufw enable
```

If CouchDB is on the same box, keep 5984 bound to `127.0.0.1` and add a
`/db/*` proxy in Caddy (see below) — do NOT expose 5984 publicly.

Optional same-origin proxy stanza to add to the Caddy site block:
```
    handle_path /db/* {
        reverse_proxy 127.0.0.1:5984
    }
```
If you use this pattern, set `ConnectionString` to
`https://setpoint.rbhsolutions.com/db/` (same origin — no CORS needed).

### 7. DNS

Point `setpoint.rbhsolutions.com` at the server IP.

## Different environments = different app-settings.json

Same app binary, different config on each server:

| Environment | Just edit                                        |
|-------------|--------------------------------------------------|
| Dev laptop  | `weekly-planner\public\app-settings.json`         |
| Staging     | `/var/www/setpoint/app-settings.json` on staging  |
| Production  | `/var/www/setpoint/app-settings.json` on prod     |

No rebuild for any of these. Edit five fields, hard-refresh, done.

## Verification checklist

1. `https://setpoint.rbhsolutions.com` loads the login page (Setpoint hero).
2. `https://setpoint.rbhsolutions.com/app-settings.json` returns the config
   (sanity: if the browser can read it, the app can).
3. Sign in with any RBH user PIN. DevTools → Network → look for requests
   against the CouchDB URL returning 200 — that's replication running.

## Contact

Abinash Parida — abinash.parida@rbhsolutions.com
