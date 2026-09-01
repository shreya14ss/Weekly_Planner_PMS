# RBH Weekly SCADA Project Planner

Rebuild of the RBH Solutions weekly project tracker as an offline-first Angular application. Replaces the legacy single-file HTML app (`Weekly_Planner_Fixed_21_3.html`, ~7,400 lines) with a proper, testable, scalable stack.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Angular 21** (standalone + Signals, zoneless) | Modern DX, small runtime, no NgModule ceremony |
| State | **Signals + Repository pattern** | Sufficient scale — NgRx would be overkill |
| Database | **PouchDB → CouchDB** | True offline-first for field engineers at remote substations; MVCC handles conflicts |
| UI | **PrimeNG** + Aura theme | Data-dense industrial dashboard fit; DataTable, Chart out of the box |
| Styling | **Tailwind CSS v3** with `tailwindcss-primeui` | Utility layer without fighting PrimeNG |
| Dates | **date-fns** | Immutable, tree-shakeable |
| Excel | **xlsx (SheetJS)** | Same lib the legacy HTML already used |
| Lint / Format | **ESLint + Prettier** | Standard |

## Domain model at a glance

Every doc lives in a single PouchDB database and is discriminated by a `docType` field. IDs are prefixed for cheap range scans (`allDocs({ startkey: 'project:', endkey: 'project:￰' })`).

```
project:<id>          → ProjectDoc
user:<id>             → UserDoc
week:<YYYY-MM-DD>     → WeekDoc { entries: Record<projectId, ProjectWeekEntry> }
audit:<iso-ts>-<rand> → AuditDoc
```

See [`src/app/models`](src/app/models) for the full typed schema.

## Project structure

```
src/app/
├── core/                # Cross-cutting singletons
│   ├── pouchdb/         # DatabaseService + typed repositories
│   ├── services/        # AuthService, etc.
│   └── guards/          # Route guards
├── shared/              # Reusable UI, pipes, utils (date, etc.)
├── models/              # TypeScript domain models
├── features/            # Route-owning feature modules (lazy loaded)
│   ├── auth/            # Login (PIN-based)
│   ├── dashboard/       # KPIs, matrix, trackers
│   ├── projects/        # Weekly tasks, carry-forward
│   ├── users/           # User management (PM only)
│   ├── alerts/
│   ├── completed/
│   └── history/         # Audit trail (PM/TL only)
└── layout/
    └── app-shell/       # Top bar + tab nav after login
```

## Setup

```bash
# Install
npm install

# Run dev server (http://localhost:4200)
npm start

# Build for prod
npm run build

# Lint
npm run lint

# Format
npm run format
```

Default login on first boot: **Project Manager / PIN 0000**. The app seeds a PM user automatically so you're never locked out.

## Live sync with CouchDB (optional)

For real-time cross-device sync during dev:

```bash
npm run couch:up
```

Then follow [ops/couch/bootstrap.md](ops/couch/bootstrap.md) — takes ~2 minutes.

Without CouchDB configured, the app runs 100% offline against browser IndexedDB via PouchDB. Data is not lost; sync just becomes a no-op until a remote is wired.

## Key architectural decisions

1. **Offline-first is a hard requirement.** Engineers commission substations at remote sites. PouchDB's IndexedDB adapter + bidirectional CouchDB replication is the whole reason the DB was chosen.
2. **Signals over RxJS `BehaviorSubject`** for feature state. Repositories expose `Signal<T[]>`; components consume directly. RxJS still fronts the PouchDB change feed because it's a stream, not a value.
3. **Single-database + docType discriminator** — simpler than N databases, one sync channel, doesn't sacrifice query performance because we key-prefix.
4. **Empty-write guard on week docs** ports over the crucial defect fix from the legacy app (§7 of the architecture doc). `WeekRepository.save()` throws on empty entries unless `allowEmpty: true` — prevents a stale listener from wiping team data.
5. **Change feed → signal updates** for reactive UI without polling. Each repository filters the PouchDB change stream by its own doc-type prefix and updates its cached signal in place.

## Migration from the legacy HTML

Data can be imported from the existing localStorage keys (`wpr_projects`, `wpr_users`, `wpr_data_YYYY-MM-DD`) or from the Firebase JSON export (`rbhpms1-default-rtdb-export.json` in the parent folder). A migration script will land under `scripts/` before the first prod cutover.
