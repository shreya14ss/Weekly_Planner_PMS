# CouchDB — Local Dev Setup

For team members who want live-sync during development.

## Start

```
npm run couch:up
```

CouchDB starts on `http://localhost:5984`. Fauxton admin UI: `http://localhost:5984/_utils`.

Default credentials (dev only): `admin` / `devpassword`.

## First-time init

Create the app database and the system DBs CouchDB needs on first boot:

```bash
curl -X PUT http://admin:devpassword@localhost:5984/_users
curl -X PUT http://admin:devpassword@localhost:5984/_replicator
curl -X PUT http://admin:devpassword@localhost:5984/rbh_wpr
```

## Wire the Angular app to sync

Edit [`src/environments/environment.ts`](../../src/environments/environment.ts):

```ts
couch: {
  localDbPrefix: 'rbh_wpr',
  remoteUrl: 'http://admin:devpassword@localhost:5984/rbh_wpr',
  liveSync: true,
}
```

Refresh the app — you should see the sync badge go from `idle` → `active`.

## Stop

```
npm run couch:down
```

Data persists in the `couch-data` Docker volume. To wipe:

```
docker volume rm weekly-planner_couch-data weekly-planner_couch-conf
```

## Production considerations

- **Never** embed admin credentials in the client. Set up a per-user CouchDB
  account (`_users` doc per app user) and authenticate via cookie sessions.
- Put CouchDB behind a reverse proxy (nginx/Caddy) with TLS.
- Tighten CORS to only your app's origin.
- Enable `require_valid_user = true` and use RLS-style validation functions
  in `_design/auth` to enforce PM/TL/User access on the server side.
