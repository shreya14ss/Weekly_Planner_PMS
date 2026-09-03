export interface CouchDbConfig {
  /** Base CouchDB URL, no DB name, no credentials, e.g. "http://164.52.199.179:5984/". Source of truth. */
  readonly ConnectionString: string;
  /** Informational — mirrors ConnectionString for parity with the RBH .NET config style. Not read by code. */
  readonly couchIp: string;
  /** Informational — mirrors ConnectionString for parity with the RBH .NET config style. Not read by code. */
  readonly port: string;
  readonly DBName: string;
  readonly User: string;
  readonly Password: string;
  readonly LiveSync: boolean;
  /** Name of the local IndexedDB in each browser. Usually match DBName. */
  readonly LocalDbPrefix: string;
}

export interface AppSettings {
  readonly appName: string;
  readonly org: string;
  readonly tagline: string;

  readonly CouchDB: CouchDbConfig;

  readonly features: {
    readonly legacyImport: boolean;
    readonly auditLog: boolean;
    readonly excelExport: boolean;
  };

  readonly limits: {
    readonly maxProjectsPerUser: number;
    readonly auditRetentionDays: number;
    readonly backdatingDaysAllowed: number;
  };

  readonly support: {
    readonly contactEmail: string;
    readonly docsUrl: string;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  appName: 'Setpoint',
  org: 'RBH Solutions',
  tagline: 'Weekly SCADA Project Tracker',
  CouchDB: {
    ConnectionString: 'http://localhost:5984/',
    couchIp: '127.0.0.1',
    port: '5984',
    DBName: 'rbh_wpr',
    User: '',
    Password: '',
    LiveSync: true,
    LocalDbPrefix: 'rbh_wpr',
  },
  features: {
    legacyImport: false,
    auditLog: true,
    excelExport: true,
  },
  limits: {
    maxProjectsPerUser: 50,
    auditRetentionDays: 365,
    backdatingDaysAllowed: 14,
  },
  support: {
    contactEmail: '',
    docsUrl: '',
  },
};

/**
 * Assemble a PouchDB-ready URL from the config:
 *   ConnectionString = "http://164.52.199.179:5984/"
 *   User             = "admin"
 *   Password         = "rbh@123456"    (URL-encoded to survive parsing)
 *   DBName           = "rss8001db"
 * →   "http://admin:rbh%40123456@164.52.199.179:5984/rss8001db"
 *
 * Returns '' when ConnectionString or DBName is missing — signals
 * "run local-only, no remote sync".
 */
export function buildRemoteUrl(cfg: CouchDbConfig): string {
  if (!cfg.ConnectionString || !cfg.DBName) return '';

  const base = cfg.ConnectionString.replace(/\/+$/, '');
  const match = /^(https?:\/\/)(.+)$/.exec(base);
  if (!match) return '';

  const [, protocol, hostPart] = match;
  const creds =
    cfg.User && cfg.Password
      ? `${encodeURIComponent(cfg.User)}:${encodeURIComponent(cfg.Password)}@`
      : '';

  return `${protocol}${creds}${hostPart}/${cfg.DBName}`;
}
