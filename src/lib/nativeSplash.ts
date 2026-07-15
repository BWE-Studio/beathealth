import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";

let splashHidden = false;

export const hideNativeSplash = () => {
  if (splashHidden || !Capacitor.isNativePlatform()) return;

  splashHidden = true;
  void SplashScreen.hide().catch(() => {
    // The native splash may already be hidden on some launch paths.
  });
};
