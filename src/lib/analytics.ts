import { Capacitor } from "@capacitor/core";

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

/** Envia um evento para o dataLayer do GTM (web e APK). */
export function track(event: string, params: Record<string, unknown> = {}) {
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event,
      platform: Capacitor.getPlatform(),
      ...params,
    });
  } catch {
    // analytics nunca deve quebrar o app
  }
}

export function trackPageView(path: string) {
  track("page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
