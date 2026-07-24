#!/usr/bin/env bash
# Decode and validate the App Store Connect API .p8 key for CI upload steps.
set -euo pipefail

if [ -z "${GITHUB_ENV:-}" ] || [ -z "${GITHUB_OUTPUT:-}" ]; then
  echo "prepare-appstore-api-key.sh must run in GitHub Actions." >&2
  exit 1
fi

KEY_FILE="${RUNNER_TEMP:-/tmp}/AuthKey.p8"

if [ -n "${APPSTORE_PRIVATE_KEY_BASE64:-}" ]; then
  # Preferred: single-line base64 avoids PEM newline corruption in GitHub secrets.
  printf '%s' "$APPSTORE_PRIVATE_KEY_BASE64" | tr -d '\n\r ' | openssl base64 -d -A > "$KEY_FILE"
elif [ -n "${APPSTORE_PRIVATE_KEY:-}" ]; then
  printf '%s\n' "$APPSTORE_PRIVATE_KEY" > "$KEY_FILE"
else
  echo "Missing APPSTORE_PRIVATE_KEY_BASE64 (recommended) or APPSTORE_PRIVATE_KEY." >&2
  exit 1
fi

if ! openssl pkey -in "$KEY_FILE" -noout 2>/dev/null; then
  echo "App Store Connect API key is not valid PEM." >&2
  echo "Re-create the secret from your .p8 download:" >&2
  echo "  base64 -i ~/Downloads/AuthKey_<KEY_ID>.p8 | pbcopy" >&2
  echo "  → GitHub secret APPSTORE_PRIVATE_KEY_BASE64" >&2
  exit 1
fi

echo "APPSTORE_PRIVATE_KEY_FILE=$KEY_FILE" >> "$GITHUB_ENV"

{
  echo "private_key<<EOF"
  cat "$KEY_FILE"
  echo "EOF"
} >> "$GITHUB_OUTPUT"

echo "App Store Connect API key validated."
