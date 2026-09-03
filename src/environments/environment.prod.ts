export const environment = {
  production: true,
  appName: 'Setpoint',
  couch: {
    localDbPrefix: 'rbh_wpr',
    remoteUrl: '',
    liveSync: true,
  },
} as const;
