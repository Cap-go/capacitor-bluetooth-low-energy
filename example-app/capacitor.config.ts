import type { CapacitorConfig } from '@capacitor/cli';

import pkg from './package.json';

const config: CapacitorConfig = {
  appId: 'ee.forgr.plugin.bluetoothlowenergy.example',
  appName: 'BLE Example',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorUpdater: {
      appId: 'ee.forgr.plugin.bluetoothlowenergy.example',
      autoUpdate: true,
      autoSplashscreen: true,
      directUpdate: 'always',
      defaultChannel: 'production',
      version: pkg.version,
    },
  },
};

export default config;
