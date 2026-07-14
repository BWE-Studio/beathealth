import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { toast } from "sonner";
import {
  createSessionFromNativeUrl,
  isNativeAuthCallback,
  isNativePlatform,
} from "@/lib/nativeAuth";

export const NativeAuthRedirectHandler = () => {
  const navigate = useNavigate();
  const handledUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativePlatform()) return;

    const handleUrl = async (url?: string) => {
      if (!url || !isNativeAuthCallback(url) || handledUrlRef.current === url) return;

      handledUrlRef.current = url;

      try {
        await Browser.close();
      } catch {
        // Browser may already be closed when the app is opened from an email app.
      }

      try {
        const { session, next } = await createSessionFromNativeUrl(url);
        if (session) {
          navigate(next, { replace: true });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Authentication failed";
        toast.error(message);
        navigate("/auth", { replace: true });
      }
    };

    let removeListener: (() => void) | undefined;

    CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      void handleUrl(url);
    }).then((listener) => {
      removeListener = () => {
        void listener.remove();
      };
    });

    CapacitorApp.getLaunchUrl().then((launchUrl) => {
      void handleUrl(launchUrl?.url);
    });

    return () => {
      removeListener?.();
    };
  }, [navigate]);

  return null;
};
