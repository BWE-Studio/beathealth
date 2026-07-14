import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";

const NATIVE_AUTH_SCHEME = "com.beat.bwe";
const NATIVE_AUTH_HOST = "auth";
const NATIVE_AUTH_PATH = "/callback";
const DEFAULT_AUTH_RETURN_PATH = "/app/home";

export const isNativePlatform = () => Capacitor.isNativePlatform();

export const getAuthRedirectUrl = (returnPath = DEFAULT_AUTH_RETURN_PATH) => {
  if (!isNativePlatform()) {
    return `${window.location.origin}${returnPath}`;
  }

  const callbackUrl = new URL(`${NATIVE_AUTH_SCHEME}://${NATIVE_AUTH_HOST}${NATIVE_AUTH_PATH}`);
  callbackUrl.searchParams.set("next", returnPath);
  return callbackUrl.toString();
};

export const openNativeOAuthUrl = async (url: string) => {
  await Browser.open({ url });
};

export const isNativeAuthCallback = (url: string) =>
  url.startsWith(`${NATIVE_AUTH_SCHEME}://${NATIVE_AUTH_HOST}${NATIVE_AUTH_PATH}`);

export const createSessionFromNativeUrl = async (url: string) => {
  const callbackUrl = new URL(url);
  const queryParams = callbackUrl.searchParams;
  const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));

  const error =
    queryParams.get("error_description") ||
    queryParams.get("error") ||
    hashParams.get("error_description") ||
    hashParams.get("error");

  if (error) {
    throw new Error(error);
  }

  const code = queryParams.get("code") || hashParams.get("code");
  if (code) {
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return {
      session: data.session,
      next: queryParams.get("next") || DEFAULT_AUTH_RETURN_PATH,
    };
  }

  const accessToken = queryParams.get("access_token") || hashParams.get("access_token");
  const refreshToken = queryParams.get("refresh_token") || hashParams.get("refresh_token");

  if (accessToken && refreshToken) {
    const { data, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) throw sessionError;
    return {
      session: data.session,
      next: queryParams.get("next") || DEFAULT_AUTH_RETURN_PATH,
    };
  }

  return {
    session: null,
    next: queryParams.get("next") || DEFAULT_AUTH_RETURN_PATH,
  };
};
