#!/usr/bin/env bash
# Gradle/Android Studio olmadan imzalı APK üretir (bulut ortamında bu betikle derlendi).
# Bilgisayarda normal yol: Android Studio > Build > Generate Signed APK  ya da  gradlew assembleRelease
#
# Gerekenler (ortam değişkeniyle verilir):
#   ANDROID_JAR   platforms/android-35/android.jar
#   AAPT2         build-tools/.../aapt2
#   ZIPALIGN      build-tools/.../zipalign
#   D8_JAR        com.android.tools.r8.D8 sınıfını içeren jar (r8.jar)
#   APKSIGNER_JAR com.android.apksigner.ApkSignerTool sınıfını içeren jar (apksigner.jar)
#   LAMBDA_STUBS  build-tools/.../core-lambda-stubs.jar (javac'ın lambda ifadeleri için)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$ROOT/app"
OUT="$ROOT/build/cli"
: "${ANDROID_JAR:?ANDROID_JAR gerekli}"
: "${AAPT2:?AAPT2 gerekli}"
: "${ZIPALIGN:?ZIPALIGN gerekli}"
: "${D8_JAR:?D8_JAR gerekli}"
: "${APKSIGNER_JAR:?APKSIGNER_JAR gerekli}"
: "${LAMBDA_STUBS:?LAMBDA_STUBS gerekli}"

gradle_value() { sed -n "s/^[[:space:]]*$1[[:space:]]*\"\{0,1\}\([^\"]*\)\"\{0,1\}[[:space:]]*$/\1/p" "$APP/build.gradle" | head -1; }
PACKAGE="$(gradle_value applicationId)"
VERSION_CODE="$(gradle_value versionCode)"
VERSION_NAME="$(gradle_value versionName)"
MIN_SDK="$(gradle_value minSdk)"
TARGET_SDK="$(gradle_value targetSdk)"
echo "Paket: $PACKAGE  sürüm: $VERSION_NAME ($VERSION_CODE)  minSdk: $MIN_SDK  targetSdk: $TARGET_SDK"

grep -q "VERSION_NAME = \"$VERSION_NAME\"" "$APP/src/main/java/com/benimmarketim/siparisalarm/BuildInfo.java" \
  || { echo "BuildInfo.VERSION_NAME, build.gradle versionName ($VERSION_NAME) ile aynı değil" >&2; exit 1; }

rm -rf "$OUT" && mkdir -p "$OUT"/{res,gen,classes,dex}

# 1) Kaynaklar
"$AAPT2" compile --dir "$APP/src/main/res" -o "$OUT/res/compiled.zip"
sed "s#<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">#<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\" package=\"$PACKAGE\">#" \
  "$APP/src/main/AndroidManifest.xml" > "$OUT/AndroidManifest.xml"
"$AAPT2" link -o "$OUT/unsigned.apk" -I "$ANDROID_JAR" \
  --manifest "$OUT/AndroidManifest.xml" \
  --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --java "$OUT/gen" --auto-add-overlay \
  "$OUT/res/compiled.zip"

# 2) Java → class → dex
find "$APP/src/main/java" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -encoding UTF-8 -source 8 -target 8 -Xlint:-options -Xlint:deprecation \
  -bootclasspath "$ANDROID_JAR:$LAMBDA_STUBS" -d "$OUT/classes" @"$OUT/sources.txt"
find "$OUT/classes" -name '*.class' > "$OUT/classes.txt"
java -cp "$D8_JAR" com.android.tools.r8.D8 --release --min-api "$MIN_SDK" \
  --lib "$ANDROID_JAR" --output "$OUT/dex" @"$OUT/classes.txt"

# 3) Paketle, hizala, imzala
cp "$OUT/unsigned.apk" "$OUT/with-dex.apk"
(cd "$OUT/dex" && zip -q -X "$OUT/with-dex.apk" classes.dex)
"$ZIPALIGN" -f -p 4 "$OUT/with-dex.apk" "$OUT/aligned.apk"

PROPS="$ROOT/keystore/keystore.properties"
[ -f "$PROPS" ] || { echo "İmza anahtarı yok: $PROPS (keystore/README)" >&2; exit 1; }
prop() { sed -n "s/^$1=//p" "$PROPS" | head -1; }
mkdir -p "$ROOT/release"
APK="$ROOT/release/BenimMarketim-SiparisAlarmi-$VERSION_NAME.apk"
java -cp "$APKSIGNER_JAR" com.android.apksigner.ApkSignerTool sign \
  --ks "$ROOT/keystore/$(prop storeFile)" --ks-key-alias "$(prop keyAlias)" \
  --ks-pass "pass:$(prop storePassword)" --key-pass "pass:$(prop keyPassword)" \
  --min-sdk-version "$MIN_SDK" --v4-signing-enabled false --out "$APK" "$OUT/aligned.apk"
java -cp "$APKSIGNER_JAR" com.android.apksigner.ApkSignerTool verify --verbose --min-sdk-version "$MIN_SDK" "$APK" | head -5
echo "APK hazır: $APK"
