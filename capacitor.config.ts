import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.beat.bwe',
  appName: 'BEAT',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      overlaysWebView: false
    }
  }
};

export default config;