import type { CapacitorConfig } from "@capacitor/cli";

// OTA: o APK carrega o app direto do site publicado no Vercel, então todo
// `deploy:web` atualiza o app sem gerar APK novo. Só é preciso um APK novo
// quando muda algo NATIVO (plugin Capacitor, AndroidManifest, ícone, permissões).
//
// Variáveis de ambiente (só para o build do APK):
//   CAP_BUNDLED=1       -> APK autônomo: usa o dist/ embutido, sem OTA
//   CAP_SERVER_URL=...  -> aponta para outro endereço (ex.: dev na rede local)
const PROD_URL = "https://rolezinho-amigos.vercel.app";
const serverUrl =
  process.env.CAP_BUNDLED === "1"
    ? undefined
    : (process.env.CAP_SERVER_URL ?? PROD_URL);

const config: CapacitorConfig = {
  appId: "com.taverna.amigos",
  appName: "Rolezinho Roots",
  webDir: "dist",
  server: {
    androidScheme: "https",
    ...(serverUrl ? { url: serverUrl } : {}),
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
