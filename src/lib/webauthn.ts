import { Capacitor } from "@capacitor/core";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";


export function isPasskeySupported(): boolean {
    try {
        if (Capacitor.isNativePlatform()) return true;
        return browserSupportsWebAuthn();
    } catch {
        return false;
    }
}


export function getDefaultDeviceName(): string {
    if (typeof navigator === "undefined") return "Dispositivo não classificado"
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    if (/Android/i.test(ua)) return "Android";
    if (/Mac/i.test(ua)) return "Mac";
    if (/Windows/i.test(ua)) return "Windows";
    return "Navegador";
}