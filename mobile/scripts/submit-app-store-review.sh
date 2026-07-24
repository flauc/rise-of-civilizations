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
REPO_ROOT="$(cd "$MOBILE_DIR/.." && pwd)"
APP_VERSION="$(node -p "require('${REPO_ROOT}/package.json').version")"
API_KEY_PATH="${RUNNER_TEMP:-/tmp}/asc-api-key.json"
LOG="${RUNNER_TEMP:-/tmp}/fastlane-deliver.log"

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

echo "Submitting ${APP_ID} ${APP_VERSION} for App Store review (binary already uploaded)…"

DELIVER_ARGS=(
  --api_key_path "$API_KEY_PATH"
  --app_identifier "$APP_ID"
  --platform ios
  --app_version "$APP_VERSION"
  --skip_binary_upload true
  --skip_screenshots true
  --skip_metadata true
  --skip_app_version_update false
  --submit_for_review true
  --automatic_release true
  --precheck_include_in_app_purchases false
  --force
)

# Optional: cancel an existing Waiting for Review submission and submit this build instead.
if [[ "${IOS_REJECT_WAITING_REVIEW:-false}" == "true" ]]; then
  DELIVER_ARGS+=(--reject_if_possible true)
fi

set +e
fastlane deliver "${DELIVER_ARGS[@]}" 2>&1 | tee "$LOG"
status=${PIPESTATUS[0]}
set -e

if [ "$status" -eq 0 ]; then
  echo "Submitted ${APP_ID} for App Store review (automatic release after approval)."
  exit 0
fi

if grep -qiE 'could not be added|Waiting For Review|waiting for review|not acceptable for the current resource state' "$LOG"; then
  echo "::warning::App Store submit skipped: a version is already Waiting for Review (Apple will not attach a newer build)."
  echo "This CI run's upload succeeded — the new build is in TestFlight."
  echo "Wait for Apple to review the current submission, cancel it in App Store Connect, or set IOS_REJECT_WAITING_REVIEW=true to replace it on the next run."
  exit 0
fi

if grep -qiE 'could not find an editable version' "$LOG"; then
  echo "::warning::App Store submit skipped: App Store Connect has no editable version slot for ${APP_VERSION}."
  echo "This CI run's upload succeeded — the new build is in TestFlight."
  echo "If ${APP_VERSION} is already live on the App Store, bump root package.json to a higher version (e.g. 1.0.5) and push main again."
  echo "Otherwise open App Store Connect → your app → iOS App → + Version and create ${APP_VERSION}, or re-run CI after this script fix."
  exit 0
fi

echo "fastlane deliver failed (exit ${status}). See log above." >&2
exit "$status"
