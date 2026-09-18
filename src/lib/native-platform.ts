import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

export const ANDROID_AUTH_CALLBACK = "com.nextaurastudios.qadaltahaddi://auth/callback";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function authRedirectUrl() {
  return isNativeApp() ? ANDROID_AUTH_CALLBACK : window.location.origin;
}

/** Opens external URLs in the platform browser when running in the app. */
export async function openExternalUrl(url: string) {
  if (isNativeApp()) {
    await Browser.open({ url });
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
