/**
 * Build-time flags only. Everything else lives in public/app-settings.json,
 * loaded at runtime via AppSettingsService. Ops edits that file on the
 * server; no rebuild required to change CouchDB URL, feature flags, etc.
 */
export const environment = {
  production: true,
} as const;
