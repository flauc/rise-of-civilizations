#!/usr/bin/env bash
# Install distribution cert + provisioning profile for CI archive/export.
set -euo pipefail

: "${IOS_CERTIFICATE_BASE64:?IOS_CERTIFICATE_BASE64 is required}"
: "${IOS_CERTIFICATE_PASSWORD:?IOS_CERTIFICATE_PASSWORD is required}"
: "${IOS_PROVISIONING_PROFILE_BASE64:?IOS_PROVISIONING_PROFILE_BASE64 is required}"

KEYCHAIN="${RUNNER_TEMP:-/tmp}/roc-ios.keychain-db"
KEYCHAIN_PASSWORD="${IOS_KEYCHAIN_PASSWORD:-roc-ci-keychain}"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"

echo "$IOS_CERTIFICATE_BASE64" | base64 --decode > /tmp/roc-dist.p12
security import /tmp/roc-dist.p12 -k "$KEYCHAIN" -P "$IOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security list-keychain -d user -s "$KEYCHAIN" login.keychain

echo "$IOS_PROVISIONING_PROFILE_BASE64" | base64 --decode > /tmp/roc.mobileprovision
PROFILE_UUID="$(/usr/libexec/PlistBuddy -c 'Print :UUID' /dev/stdin <<< "$(security cms -D -i /tmp/roc.mobileprovision)")"
PROFILE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :Name' /dev/stdin <<< "$(security cms -D -i /tmp/roc.mobileprovision)")"
mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
cp /tmp/roc.mobileprovision ~/Library/MobileDevice/Provisioning\ Profiles/"${PROFILE_UUID}.mobileprovision"

{
  echo "IOS_PROFILE_UUID=${PROFILE_UUID}"
  echo "IOS_PROFILE_NAME=${PROFILE_NAME}"
} >> "${GITHUB_ENV:-/dev/null}"

echo "Installed provisioning profile: ${PROFILE_NAME} (${PROFILE_UUID})"
