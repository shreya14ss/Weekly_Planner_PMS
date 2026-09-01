export const environment = {
  production: true,
  appName: 'RBH Weekly Planner',
  couch: {
    localDbPrefix: 'rbh_wpr',
    remoteUrl: '',
    liveSync: true,
  },
} as const;
