# Setpoint — Publish Guide

How to produce a deployment zip (`setpoint-handoff.zip`) to hand to ops.

**Time:** ~2 minutes end-to-end after the first run.
**Output:** `d:\setpoint-handoff.zip` (~1.4 MB, self-contained).

---

## Prerequisites

Only needs to be done once per machine.

- **Node.js 20+** installed. Verify:
  ```powershell
  node --version
  npm --version
  ```
- Project cloned to `d:\PMS_Project\PMS_1\weekly-planner\`.
- On first ever build only, dependencies installed:
  ```powershell
  cd d:\PMS_Project\PMS_1\weekly-planner
  npm install
  ```
  Takes 1–3 minutes. Skip if `node_modules\` already exists.

---

## Step 1 — Decide the target CouchDB config

Open [public/app-settings.json](../public/app-settings.json) and set the
`CouchDB` block for the deployment you're building for:

```json
"CouchDB": {
  "ConnectionString": "http://<host>:<port>/",
  "couchIp":          "<host>",
  "port":             "<port>",
  "DBName":           "<db-name>",
  "User":             "<couch-user>",
  "Password":         "<couch-password>",
  "LiveSync":         true,
  "LocalDbPrefix":    "<db-name>"
}
```

Save. This is what the app will point at once deployed.

> 💡 If ops will edit these values on the server themselves, leave them as
> generic defaults — the file is fully editable post-deploy without a rebuild.

---

## Step 2 — Kill any running dev server

If `ng serve` is running (from a previous `npm start`), stop it — it holds
file locks that make the build fail.

- If it's in a terminal window: focus the window and press **Ctrl+C**.
- If it's a stray background process:
  ```powershell
  Get-Process node,esbuild -ErrorAction SilentlyContinue | Stop-Process -Force
  ```

Verify nothing left:
```powershell
Get-Process node,esbuild -ErrorAction SilentlyContinue
```
Should return nothing.

---

## Step 3 — Build

```powershell
cd d:\PMS_Project\PMS_1\weekly-planner
npm run build
```

Takes 30–60 seconds. Expected output ends with:
```
Application bundle generation complete. [XX seconds]
Output location: D:\PMS_Project\PMS_1\weekly-planner\dist\setpoint
```

The three PouchDB CommonJS warnings are harmless — ignore them.

If the build fails, see [Troubleshooting](#troubleshooting) below.

---

## Step 4 — Verify the build

Quick sanity check — serve the built app locally and open it in a browser:

```powershell
npx --yes serve -s d:\PMS_Project\PMS_1\weekly-planner\dist\setpoint\browser -l 5000
```

Open `http://localhost:5000` — the Setpoint login page should load with the
brand hero and login form.

Also open `http://localhost:5000/app-settings.json` — should show the JSON
you edited in Step 1.

Stop the server: focus the terminal, press **Ctrl+C**.

---

## Step 5 — Package the handoff folder

Run this PowerShell block from anywhere:

```powershell
$src  = "d:\PMS_Project\PMS_1\weekly-planner"
$root = "d:\setpoint-handoff"
$zip  = "d:\setpoint-handoff.zip"

# Wipe previous handoff
if (Test-Path $root) { Remove-Item -Recurse -Force $root }
if (Test-Path $zip)  { Remove-Item -Force $zip }

# Assemble
New-Item -ItemType Directory -Path "$root\app","$root\couchdb-config" -Force | Out-Null
Copy-Item -Recurse -Path "$src\dist\setpoint\browser\*"           -Destination "$root\app\"
Copy-Item          -Path "$src\dist\setpoint\3rdpartylicenses.txt" -Destination "$root\app\"
Copy-Item          -Path "$src\ops\couch\local.ini"                -Destination "$root\couchdb-config\"
Copy-Item          -Path "$src\ops\DEPLOY.md"                      -Destination "$root\"

# Zip
Compress-Archive -Path "$root\*" -DestinationPath $zip -CompressionLevel Optimal
"Published: {0}  --  {1:N2} MB" -f (Get-Item $zip).FullName, ((Get-Item $zip).Length / 1MB)
```

Expected output:
```
Published: D:\setpoint-handoff.zip  --  1.42 MB
```

> 📝 The script copies `DEPLOY.md` from `weekly-planner\ops\DEPLOY.md`.
> That file must exist. If it lives elsewhere, adjust the path.

---

## Step 6 — Send

Attach `d:\setpoint-handoff.zip` to email / OneDrive / Google Drive.
Under 2 MB, fits any inbox.

The zip contains:

```
setpoint-handoff/
├── DEPLOY.md              ← what ops reads first
├── app/                   ← ~50 files, drop into /var/www/setpoint/
│   ├── index.html
│   ├── app-settings.json  ← ops edits this on the server for their env
│   ├── main-*.js, chunk-*.js, styles-*.css
│   ├── rss.png, rbh-logo.png, favicon.ico
│   └── media/             ← fonts + PrimeIcons
└── couchdb-config/
    └── local.ini          ← reference CouchDB config
```

---

## Optional — one-command publish

Save the following as `publish.ps1` in `weekly-planner\`:

```powershell
# publish.ps1 — build and package Setpoint for handoff
Set-Location $PSScriptRoot

Write-Host "→ Building..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

$src  = $PSScriptRoot
$root = "d:\setpoint-handoff"
$zip  = "d:\setpoint-handoff.zip"

Write-Host "→ Packaging..." -ForegroundColor Cyan
if (Test-Path $root) { Remove-Item -Recurse -Force $root }
if (Test-Path $zip)  { Remove-Item -Force $zip }

New-Item -ItemType Directory -Path "$root\app","$root\couchdb-config" -Force | Out-Null
Copy-Item -Recurse -Path "$src\dist\setpoint\browser\*"            -Destination "$root\app\"
Copy-Item          -Path "$src\dist\setpoint\3rdpartylicenses.txt"  -Destination "$root\app\"
Copy-Item          -Path "$src\ops\couch\local.ini"                 -Destination "$root\couchdb-config\"
Copy-Item          -Path "$src\ops\DEPLOY.md"                       -Destination "$root\"

Compress-Archive -Path "$root\*" -DestinationPath $zip -CompressionLevel Optimal

Write-Host "→ Done." -ForegroundColor Green
"   Published: {0}  --  {1:N2} MB" -f (Get-Item $zip).FullName, ((Get-Item $zip).Length / 1MB)
```

Then every future publish is one command:

```powershell
d:\PMS_Project\PMS_1\weekly-planner\publish.ps1
```

---

## Troubleshooting

### `EPERM: operation not permitted, unlink ... esbuild.exe`

A running `ng serve` or another node process is holding the file open.
Kill it and rerun:
```powershell
Get-Process node,esbuild -ErrorAction SilentlyContinue | Stop-Process -Force
```

### `Could not find the '@angular/build:application' builder's node package`

`node_modules\` is corrupt or incomplete. Reinstall:
```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

### Build succeeds but sanity check shows blank page

- Hard-refresh browser (Ctrl+Shift+R) — favicon and old bundle may be cached.
- Confirm you're serving from `dist\setpoint\browser\` (not the parent).
- Check DevTools → Console for errors.

### CORS errors when the app tries to reach CouchDB

Not a build problem. Enable CORS on the target CouchDB — see the CORS
section of `DEPLOY.md`.

---

## Cheat sheet

| Task                                    | Command                                 |
|-----------------------------------------|-----------------------------------------|
| Full build                              | `npm run build`                         |
| Local sanity check                      | `npx --yes serve -s dist\setpoint\browser -l 5000` |
| Kill any running dev server             | `Get-Process node,esbuild \| Stop-Process -Force` |
| Change config after build (no rebuild)  | Edit `dist\setpoint\browser\app-settings.json` |
| Full publish (build + zip)              | `.\publish.ps1`                         |
