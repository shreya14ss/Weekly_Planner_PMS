import { Injectable } from '@angular/core';
import { AppSettings, CouchDbConfig, DEFAULT_SETTINGS, buildRemoteUrl } from './app-settings.model';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/**
 * Reads `public/app-settings.json` at boot. Ops can edit that file on the
 * server without a rebuild; users see the new config on next hard-refresh.
 * Missing keys fall back to DEFAULT_SETTINGS so a partial file still works.
 */
@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  private settings: AppSettings = DEFAULT_SETTINGS;

  async load(): Promise<void> {
    try {
      const res = await fetch('app-settings.json', { cache: 'no-cache' });
      if (!res.ok) {
        console.warn('[settings] app-settings.json not found, using defaults');
        return;
      }
      const raw = (await res.json()) as DeepPartial<AppSettings>;
      this.settings = this.merge(DEFAULT_SETTINGS, raw);
    } catch (err) {
      console.warn('[settings] failed to load, using defaults', err);
    }
  }

  get all(): AppSettings {
    return this.settings;
  }

  get appName(): string {
    return this.settings.appName;
  }
  get org(): string {
    return this.settings.org;
  }
  get tagline(): string {
    return this.settings.tagline;
  }
  get couch(): CouchDbConfig {
    return this.settings.CouchDB;
  }

  /** Assembled `http[s]://user:pass@host:port/db` URL for PouchDB replication. */
  get couchUrl(): string {
    return buildRemoteUrl(this.settings.CouchDB);
  }

  get features(): AppSettings['features'] {
    return this.settings.features;
  }
  get limits(): AppSettings['limits'] {
    return this.settings.limits;
  }
  get support(): AppSettings['support'] {
    return this.settings.support;
  }

  private merge(base: AppSettings, override: DeepPartial<AppSettings>): AppSettings {
    return {
      ...base,
      ...override,
      CouchDB: { ...base.CouchDB, ...(override.CouchDB ?? {}) },
      features: { ...base.features, ...(override.features ?? {}) },
      limits: { ...base.limits, ...(override.limits ?? {}) },
      support: { ...base.support, ...(override.support ?? {}) },
    } as AppSettings;
  }
}
