#!/usr/bin/env bash
# Write fastlane / App Store Connect API key JSON from a validated .p8 file.
set -euo pipefail

: "${API_KEY_PATH:?API_KEY_PATH is required}"
: "${APPSTORE_KEY_ID:?APPSTORE_KEY_ID is required}"
: "${APPSTORE_ISSUER_ID:?APPSTORE_ISSUER_ID is required}"

if [ -n "${APPSTORE_PRIVATE_KEY_FILE:-}" ]; then
  export KEY_SOURCE=file
  export KEY_FILE="$APPSTORE_PRIVATE_KEY_FILE"
elif [ -n "${APPSTORE_PRIVATE_KEY:-}" ]; then
  export KEY_SOURCE=env
else
  echo "APPSTORE_PRIVATE_KEY_FILE or APPSTORE_PRIVATE_KEY is required." >&2
  exit 1
fi

ruby -rjson -e '
  key = if ENV.fetch("KEY_SOURCE") == "file"
    File.read(ENV.fetch("KEY_FILE"))
  else
    ENV.fetch("APPSTORE_PRIVATE_KEY")
  end
  File.write(
    ENV.fetch("API_KEY_PATH"),
    {
      key_id: ENV.fetch("APPSTORE_KEY_ID"),
      issuer_id: ENV.fetch("APPSTORE_ISSUER_ID"),
      key: key,
      in_house: false
    }.to_json
  )
'
