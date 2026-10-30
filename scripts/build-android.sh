#!/usr/bin/env bash
# Gera o APK debug como rolezinho.apk (o Gradle nomeia app-debug.apk por padrão:
# módulo "app" + variante "debug"). Copia para a Área de Trabalho do Windows
# quando o diretório existir. Não sobe versão nem faz build web (ver deploy:android).
set -euo pipefail
cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
if [ ! -d "$JAVA_HOME" ] && [ -d "$HOME/tools/jdk21" ]; then export JAVA_HOME="$HOME/tools/jdk21"; fi
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/tools/android-sdk" ]; then export ANDROID_HOME="$HOME/tools/android-sdk"; fi

npx cap sync android
(cd android && ./gradlew assembleDebug)

OUT=android/app/build/outputs/apk/debug
cp "$OUT/app-debug.apk" "$OUT/rolezinho.apk"
echo "APK: $OUT/rolezinho.apk"

for desktop in "/mnt/c/Users/Fernando Valani/Desktop" "/mnt/c/Users/fernandovalani_lance/Desktop"; do
  if [ -d "$desktop" ]; then
    cp "$OUT/rolezinho.apk" "$desktop/rolezinho.apk"
    echo "Copiado para: $desktop/rolezinho.apk"
  fi
done
