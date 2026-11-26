package com.taverna.amigos;

import android.app.Activity;
import android.os.CancellationSignal;

import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePublicKeyCredentialRequest;
import androidx.credentials.CreatePublicKeyCredentialResponse;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetPublicKeyCredentialOption;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.PublicKeyCredential;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.Executors;

@CapacitorPlugin(name = "Passkey")
public class PasskeyPlugin extends Plugin {

    @PluginMethod
    public void authenticate(PluginCall call) {
        String optionsJson = call.getString("optionsJson");

        if (optionsJson == null || optionsJson.isEmpty()) {
            call.reject("optionsJson é obrigatório");
            return;
        }

        Activity activity = getActivity();

        if (activity == null) {
            call.reject("Activity indisponível");
            return;
        }

        try {
    JSONObject options = new JSONObject(optionsJson);

    GetPublicKeyCredentialOption credentialOption =
        new GetPublicKeyCredentialOption(options.toString());

    GetCredentialRequest request =
        new GetCredentialRequest.Builder()
            .addCredentialOption(credentialOption)
            .build();

    CredentialManager credentialManager =
        CredentialManager.create(activity.getApplicationContext());

    credentialManager.getCredentialAsync(
        activity,
        request,
        new CancellationSignal(),
        Executors.newSingleThreadExecutor(),
        new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
            @Override
            public void onResult(GetCredentialResponse response) {
                if (response.getCredential() instanceof PublicKeyCredential) {
                    PublicKeyCredential publicKeyCredential =
                        (PublicKeyCredential) response.getCredential();

                    JSObject result = new JSObject();
                    result.put(
                        "credentialJson",
                        publicKeyCredential.getAuthenticationResponseJson()
                    );
                    call.resolve(result);
                } else {
                    call.reject("Resposta inesperada ao autenticar passkey");
                }
            }

            @Override
            public void onError(GetCredentialException error) {
                call.reject(
                    error.getMessage() != null
                        ? error.getMessage()
                        : "Falha na autenticação por passkey"
                );
            }
        }
    );
} catch (Exception e) {
    call.reject(
        e.getMessage() != null
            ? e.getMessage()
            : "Erro inesperado no plugin Passkey"
    );
}
    }

    @PluginMethod
    public void register(PluginCall call) {
        String optionsJson = call.getString("optionsJson");

        if (optionsJson == null || optionsJson.isEmpty()) {
            call.reject("optionsJson é obrigatório");
            return;
        }

        Activity activity = getActivity();

        if (activity == null) {
            call.reject("Activity indisponível");
            return;
        }

        try {
            JSONObject options = new JSONObject(optionsJson);

            JSONObject androidOptions = new JSONObject();
            androidOptions.put("challenge", options.getString("challenge"));

            JSONObject rp = new JSONObject();
            rp.put(
                "id",
                options.has("rpId")
                    ? options.getString("rpId")
                    : options.getJSONObject("rp").getString("id")
            );
            rp.put(
                "name",
                options.optString("rpName", "Taverna Amigos")
            );
            androidOptions.put("rp", rp);

            JSONObject user = new JSONObject();
            user.put("id", options.getString("userId"));
            user.put("name", options.getString("userName"));
            user.put(
                "displayName",
                options.optString(
                    "userDisplayName",
                    options.getString("userName")
                )
            );
            androidOptions.put("user", user);

            if (options.has("pubKeyCredParams")) {
                androidOptions.put(
                    "pubKeyCredParams",
                    options.getJSONArray("pubKeyCredParams")
                );
            }

            if (options.has("authenticatorSelection")) {
                androidOptions.put(
                    "authenticatorSelection",
                    options.getJSONObject("authenticatorSelection")
                );
            }

            androidOptions.put(
                "attestation",
                options.optString("attestation", "none")
            );

            androidOptions.put(
                "timeout",
                options.optInt("timeout", 60000)
            );

            CreatePublicKeyCredentialRequest request =
                new CreatePublicKeyCredentialRequest(androidOptions.toString());

            CredentialManager credentialManager =
                CredentialManager.create(activity.getApplicationContext());

            credentialManager.createCredentialAsync(
                activity,
                request,
                new CancellationSignal(),
                Executors.newSingleThreadExecutor(),
                new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
                    @Override
                    public void onResult(CreateCredentialResponse response) {
                        if (response instanceof CreatePublicKeyCredentialResponse) {
                            CreatePublicKeyCredentialResponse credentialResponse =
                                (CreatePublicKeyCredentialResponse) response;

                            JSObject result = new JSObject();
                            result.put(
                                "credentialJson",
                                credentialResponse.getRegistrationResponseJson()
                            );
                            call.resolve(result);
                        } else {
                            call.reject("Resposta inesperada ao criar passkey");
                        }
                    }

                    @Override
                    public void onError(CreateCredentialException error) {
                        call.reject(
                            error.getMessage() != null
                                ? error.getMessage()
                                : "Falha ao criar passkey"
                        );
                    }
                }
            );
        } catch (Exception e) {
            call.reject(
                e.getMessage() != null
                    ? e.getMessage()
                    : "Erro inesperado no plugin Passkey"
            );
        }
    }
}