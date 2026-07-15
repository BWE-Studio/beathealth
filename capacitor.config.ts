import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.beat.bwe',
  appName: 'BEAT',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      overlaysWebView: false
    },
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#FFFFFFFF',
      showSpinner: false
    }
  }
};

export default config;
