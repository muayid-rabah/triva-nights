/// <reference types="@capacitor/status-bar" />

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.nextaurastudios.qadaltahaddi",
  appName: "قد التحدي",
  webDir: ".output/public",
  bundledWebRuntime: false,
  plugins: {
    // The game has a dark UI. Reserving the status-bar area prevents the
    // header from sitting underneath it on devices that support this option.
    StatusBar: {
      overlaysWebView: false,
      style: "LIGHT",
      backgroundColor: "#1A1410",
    },
  },
};

export default config;
