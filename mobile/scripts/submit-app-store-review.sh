#!/usr/bin/env bash
# Submit the latest processed build for App Store review (binary already uploaded).
set -euo pipefail

: "${APPSTORE_KEY_ID:?APPSTORE_KEY_ID is required}"
: "${APPSTORE_ISSUER_ID:?APPSTORE_ISSUER_ID is required}"
: "${APPSTORE_PRIVATE_KEY:?APPSTORE_PRIVATE_KEY is required}"

if [[ "${IOS_SUBMIT_FOR_REVIEW:-true}" != "true" ]]; then
  echo "IOS_SUBMIT_FOR_REVIEW is not true; skipping App Store submission."
  exit 0
fi

export FASTLANE_SKIP_UPDATE_CHECK=1
export FASTLANE_OPT_OUT_USAGE=1
export APP_STORE_CONNECT_API_KEY_KEY_ID="$APPSTORE_KEY_ID"
export APP_STORE_CONNECT_API_KEY_ISSUER_ID="$APPSTORE_ISSUER_ID"
export APP_STORE_CONNECT_API_KEY_KEY="$APPSTORE_PRIVATE_KEY"
export APP_STORE_CONNECT_API_KEY_IS_KEY_CONTENT_BASE64=false

APP_ID="${IOS_APP_ID:-com.riseofcivilizations.game}"

gem install fastlane --no-document

fastlane deliver \
  --app_identifier "$APP_ID" \
  --skip_binary_upload true \
  --skip_screenshots true \
  --skip_metadata true \
  --submit_for_review true \
  --automatic_release true \
  --precheck_include_in_app_purchases false \
  --force

echo "Submitted ${APP_ID} for App Store review (automatic release after approval)."
