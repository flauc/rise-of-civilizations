#!/usr/bin/env bash
# Upload a release IPA to TestFlight using a validated on-disk API key file.
set -euo pipefail

: "${IPA_PATH:?IPA_PATH is required}"
: "${APPSTORE_KEY_ID:?APPSTORE_KEY_ID is required}"
: "${APPSTORE_ISSUER_ID:?APPSTORE_ISSUER_ID is required}"
: "${APPSTORE_PRIVATE_KEY_FILE:?APPSTORE_PRIVATE_KEY_FILE is required — run prepare-appstore-api-key.sh first}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_KEY_PATH="${RUNNER_TEMP:-/tmp}/asc-api-key.json"

export API_KEY_PATH
export FASTLANE_SKIP_UPDATE_CHECK=1
export FASTLANE_OPT_OUT_USAGE=1
export FASTLANE_DISABLE_COLORS=1

bash "$SCRIPT_DIR/write-appstore-api-key-json.sh"

gem install fastlane --no-document

echo "Uploading ${IPA_PATH} to TestFlight…"
fastlane run upload_to_testflight \
  "ipa:${IPA_PATH}" \
  "api_key_path:${API_KEY_PATH}" \
  "skip_waiting_for_build_processing:false"

echo "TestFlight upload finished and build processing completed."
