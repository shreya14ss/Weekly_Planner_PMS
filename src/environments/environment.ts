/**
 * Build-time flags only. Everything else (CouchDB URL, feature flags,
 * limits) is loaded from public/app-settings.json at runtime via
 * AppSettingsService — ops can edit that file on the server without
 * a rebuild.
 */
export const environment = {
  production: false,
} as const;
