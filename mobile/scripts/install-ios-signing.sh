#!/usr/bin/env bash
# Install distribution cert + provisioning profile for CI archive/export.
set -euo pipefail

: "${IOS_CERTIFICATE_BASE64:?IOS_CERTIFICATE_BASE64 is required}"
: "${IOS_CERTIFICATE_PASSWORD:?IOS_CERTIFICATE_PASSWORD is required}"
: "${IOS_PROVISIONING_PROFILE_BASE64:?IOS_PROVISIONING_PROFILE_BASE64 is required}"

KEYCHAIN="${RUNNER_TEMP:-/tmp}/roc-ios.keychain-db"
KEYCHAIN_PASSWORD="${IOS_KEYCHAIN_PASSWORD:-roc-ci-keychain}"
P12_PATH="/tmp/roc-dist.p12"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"

import_wwdr_certs() {
  local url file
  for url in \
    "https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer" \
    "https://www.apple.com/certificateauthority/AppleWWDRCAG6.cer"
  do
    file="/tmp/$(basename "$url")"
    if curl -fsSL "$url" -o "$file"; then
      security import "$file" -k "$KEYCHAIN" -A \
        -T /usr/bin/codesign -T /usr/bin/security || true
    fi
  done
}

decode_secret_to_file() {
  local secret_b64="$1" dest="$2"
  if printf '%s' "$secret_b64" | base64 --decode > "$dest" 2>/dev/null; then
    return 0
  fi
  # Some secrets were pasted with trailing newlines from pbcopy.
  printf '%s' "$secret_b64" | tr -d '\n\r ' | base64 --decode > "$dest"
}

import_distribution_p12() {
  security import "$P12_PATH" -k "$KEYCHAIN" -P "$IOS_CERTIFICATE_PASSWORD" \
    -A -t cert -f pkcs12 \
    -T /usr/bin/codesign -T /usr/bin/security
}

maybe_repack_legacy_p12() {
  # macOS Keychain exports often use RC2-40-CBC; OpenSSL 3 on CI runners rejects it.
  if openssl pkcs12 -info -in "$P12_PATH" -passin "pass:${IOS_CERTIFICATE_PASSWORD}" -noout 2>/dev/null; then
    return 0
  fi
  echo "Repacking .p12 with OpenSSL legacy provider for CI compatibility..."
  openssl pkcs12 -legacy -in "$P12_PATH" -passin "pass:${IOS_CERTIFICATE_PASSWORD}" \
    -nodes -out /tmp/roc-cert-key.pem
  openssl pkcs12 -export -in /tmp/roc-cert-key.pem -out "$P12_PATH" \
    -passout "pass:${IOS_CERTIFICATE_PASSWORD}"
}

find_distribution_identity() {
  local line=""
  line="$(security find-identity -v -p codesigning 2>/dev/null \
    | grep -E 'Apple Distribution|iPhone Distribution' \
    | head -1 || true)"
  if [ -z "$line" ]; then
    line="$(security find-identity -p codesigning 2>/dev/null \
      | grep -E 'Apple Distribution|iPhone Distribution' \
      | head -1 || true)"
  fi
  if [ -z "$line" ]; then
    return 1
  fi
  # security find-identity -v prints: "  1) <hash> \"Apple Distribution: …\""
  sed -n 's/.*"\([^"]*\)".*/\1/p' <<< "$line"
}

import_wwdr_certs

decode_secret_to_file "$IOS_CERTIFICATE_BASE64" "$P12_PATH"
maybe_repack_legacy_p12
import_distribution_p12
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN"

LOGIN_KEYCHAIN="${HOME}/Library/Keychains/login.keychain-db"
if [ -f "$LOGIN_KEYCHAIN" ]; then
  security list-keychain -d user -s "$KEYCHAIN" "$LOGIN_KEYCHAIN"
else
  security list-keychain -d user -s "$KEYCHAIN" login.keychain
fi

decode_secret_to_file "$IOS_PROVISIONING_PROFILE_BASE64" /tmp/roc.mobileprovision
PROFILE_UUID="$(/usr/libexec/PlistBuddy -c 'Print :UUID' /dev/stdin <<< "$(security cms -D -i /tmp/roc.mobileprovision)")"
PROFILE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :Name' /dev/stdin <<< "$(security cms -D -i /tmp/roc.mobileprovision)")"
mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
cp /tmp/roc.mobileprovision ~/Library/MobileDevice/Provisioning\ Profiles/"${PROFILE_UUID}.mobileprovision"

if ! CODE_SIGN_IDENTITY="$(find_distribution_identity)"; then
  echo "No Apple Distribution identity found after import." >&2
  echo "Valid identities:" >&2
  security find-identity -v -p codesigning >&2 || true
  echo "All identities:" >&2
  security find-identity -p codesigning >&2 || true
  echo "Ensure IOS_CERTIFICATE_BASE64 is an Apple Distribution .p12 exported with its private key." >&2
  exit 1
fi

if [[ "$CODE_SIGN_IDENTITY" =~ ^[[:space:]]*[0-9]+\) ]]; then
  echo "Failed to parse code sign identity from keychain output." >&2
  echo "Parsed value: ${CODE_SIGN_IDENTITY}" >&2
  exit 1
fi

{
  echo "IOS_KEYCHAIN_PATH=${KEYCHAIN}"
  echo "IOS_PROFILE_UUID=${PROFILE_UUID}"
  echo "IOS_PROFILE_NAME=${PROFILE_NAME}"
  echo "IOS_CODE_SIGN_IDENTITY=${CODE_SIGN_IDENTITY}"
} >> "${GITHUB_ENV:-/dev/null}"

echo "Installed provisioning profile: ${PROFILE_NAME} (${PROFILE_UUID})"
echo "Using code sign identity: ${CODE_SIGN_IDENTITY}"
