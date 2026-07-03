import type { CapacitorConfig } from '@capacitor/cli';

import pkg from './package.json';

const config: CapacitorConfig = {
  appId: 'ee.forgr.plugin.bluetoothlowenergy.example',
  appName: '@capgo/capacitor-bluetooth-low-energy',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
    },
    CapacitorUpdater: {
      appId: 'ee.forgr.plugin.bluetoothlowenergy.example',
      autoUpdate: true,
      autoSplashscreen: true,
      directUpdate: 'always',
      version: pkg.version,
    },
  },
};

export default config;
