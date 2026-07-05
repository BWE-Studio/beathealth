import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.beathealth',
  appName: 'BEAT',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      overlaysWebView: false
    }
  }
};

export default config;