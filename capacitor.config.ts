import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.taverna.amigos",
  appName: "Taverna dos Amigos",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#08080f",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#08080f",
    },
  },
  android: {
    backgroundColor: "#08080f",
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
