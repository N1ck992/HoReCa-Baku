#!/usr/bin/env bash
# Сборка APK для Android (№110): bash tools/build_apk.sh <номер версии, напр. 45>
# Нужны: Java (javac), Android SDK (platforms;android-34, build-tools;34.0.0) в $ANDROID_SDK.
# Результат: dist/project-abyss-v<N>.apk и описание файлов версии android/releases/v<N>.json (для патчей).
set -euo pipefail
N="${1:?номер версии}"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_SDK:?путь к Android SDK}"; BT="$SDK/build-tools/34.0.0"; JAR="$SDK/platforms/android-34/android.jar"
W="$(mktemp -d)"; mkdir -p "$W/assets/www" "$W/classes" "$W/dex" "$ROOT/dist"
python3 "$ROOT/tools/stage_www.py" "$W/assets/www" "$N"                                # игра + файлы + version.json
"$BT/aapt2" compile --dir "$ROOT/android/res" -o "$W/res.zip"
"$BT/aapt2" link -o "$W/base.apk" -I "$JAR" --manifest "$ROOT/android/AndroidManifest.xml" -A "$W/assets" "$W/res.zip" \
  --min-sdk-version 24 --target-sdk-version 34 --version-code "$N" --version-name "v$N"
javac -nowarn -source 8 -target 8 -classpath "$JAR" -d "$W/classes" $(find "$ROOT/android/src" -name '*.java') 2>&1 | grep -v "bootstrap classpath\|^warning\|^1 warning" || true
"$BT/d8" --release --lib "$JAR" --min-api 24 --output "$W/dex" $(find "$W/classes" -name '*.class')
(cd "$W/dex" && zip -q -u "$W/base.apk" classes.dex)
"$BT/zipalign" -f -p 4 "$W/base.apk" "$W/aligned.apk"
# ключ подписи — НЕ в репозитории: путь $ABYSS_KS (по умолчанию android/abyss.keystore, он в .gitignore), пароль — $ABYSS_KS_PASS
KS="${ABYSS_KS:-$ROOT/android/abyss.keystore}"; KP="${ABYSS_KS_PASS:?пароль ключа подписи}"
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass "$KP" -keypass "$KP" -alias abyss -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=PROJECT ABYSS" >/dev/null 2>&1
"$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$KP" --key-pass "pass:$KP" --out "$ROOT/dist/project-abyss-v$N.apk" "$W/aligned.apk"
python3 "$ROOT/tools/stage_www.py" --manifest "$W/assets/www" > "$ROOT/android/releases/v$N.json"
ls -la "$ROOT/dist/project-abyss-v$N.apk"; rm -rf "$W"
