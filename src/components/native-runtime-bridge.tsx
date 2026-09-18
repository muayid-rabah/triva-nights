import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Style, StatusBar } from "@capacitor/status-bar";
import type { PluginListenerHandle } from "@capacitor/core";
import { isNativeApp } from "@/lib/native-platform";

/** Native-only behavior kept out of the browser build's runtime behavior. */
export function NativeRuntimeBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;

    void StatusBar.setOverlaysWebView({ overlay: false });
    void StatusBar.setStyle({ style: Style.Light });

    let backButtonListener: PluginListenerHandle | undefined;
    void App.addListener("backButton", ({ canGoBack }) => {
      const openDialog = document.querySelector('[role="dialog"][data-state="open"]');
      if (openDialog) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return;
      }

      if (canGoBack) {
        window.history.back();
      } else {
        void App.minimizeApp();
      }
    }).then((listener) => {
      backButtonListener = listener;
    });

    return () => {
      void backButtonListener?.remove();
    };
  }, []);

  return null;
}
