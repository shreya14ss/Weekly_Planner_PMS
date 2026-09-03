export const environment = {
  production: false,
  appName: 'Setpoint',
  couch: {
    /**
     * Local PouchDB database name (IndexedDB). Persisted per browser.
     */
    localDbPrefix: 'rbh_wpr',
    /**
     * Remote CouchDB URL for bidirectional sync. Leave empty to run
     * fully offline / local-only. Format: http://user:pass@host:5984/dbname
     * (in prod, prefer a proxy or per-user session cookies over embedding creds).
     */
    remoteUrl: '',
    /**
     * Enable live continuous replication when remoteUrl is set.
     */
    liveSync: true,
  },
} as const;
