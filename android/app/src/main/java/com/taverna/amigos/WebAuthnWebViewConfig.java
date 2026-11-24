package com.taverna.amigos;

import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

public final class WebAuthnWebViewConfig {
    private WebAuthnWebViewConfig() {
    }

    public static void enable(WebView webView) {
        if (webView == null) {
            return;
        }

        WebSettings settings = webView.getSettings();

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
            WebSettingsCompat.setWebAuthenticationSupport(
                settings,
                WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP
            );
        }
    }
}