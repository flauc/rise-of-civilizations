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

APP_ID="${IOS_APP_ID:-com.riseofcivilizations.game}"
MOBILE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_KEY_PATH="${RUNNER_TEMP:-/tmp}/asc-api-key.json"

export CI=true
export FASTLANE_SKIP_UPDATE_CHECK=1
export FASTLANE_OPT_OUT_USAGE=1
export FASTLANE_DISABLE_COLORS=1

export API_KEY_PATH
export APPSTORE_KEY_ID
export APPSTORE_ISSUER_ID
export APPSTORE_PRIVATE_KEY

# App Store Connect API key JSON (deliver reads --api_key_path in CI).
ruby -rjson -e '
  File.write(
    ENV.fetch("API_KEY_PATH"),
    {
      key_id: ENV.fetch("APPSTORE_KEY_ID"),
      issuer_id: ENV.fetch("APPSTORE_ISSUER_ID"),
      key: ENV.fetch("APPSTORE_PRIVATE_KEY"),
      in_house: false
    }.to_json
  )
'

gem install fastlane --no-document

cd "$MOBILE_DIR"

fastlane deliver \
  --api_key_path "$API_KEY_PATH" \
  --app_identifier "$APP_ID" \
  --platform ios \
  --skip_binary_upload true \
  --skip_screenshots true \
  --skip_metadata true \
  --submit_for_review true \
  --automatic_release true \
  --precheck_include_in_app_purchases false \
  --force

echo "Submitted ${APP_ID} for App Store review (automatic release after approval)."
