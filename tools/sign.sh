#!/usr/bin/env bash
# Sign + submit the extension to addons.mozilla.org (listed channel).
#
#   bash tools/sign.sh
#
# Credentials come from Bitwarden by default — see tools/amo-creds.sh, which
# finds the vault item carrying "JWT Issuer" / "JWT Secret" custom fields.
# Generate them at https://addons.mozilla.org/en-US/developers/addon/api/key/
#
# To bypass Bitwarden, set both in the environment first and this script uses
# them as-is (read -rs so the secret never lands in shell history):
#   read -rs WEB_EXT_API_KEY;    export WEB_EXT_API_KEY
#   read -rs WEB_EXT_API_SECRET; export WEB_EXT_API_SECRET
set -euo pipefail
cd "$(dirname "$0")/.."

trap 'unset WEB_EXT_API_KEY WEB_EXT_API_SECRET 2>/dev/null || true' EXIT

if [[ -z "${WEB_EXT_API_KEY:-}" || -z "${WEB_EXT_API_SECRET:-}" ]]; then
  # shellcheck source=tools/amo-creds.sh
  . "$(dirname "$0")/amo-creds.sh"
fi
: "${WEB_EXT_API_KEY:?no AMO issuer resolved}"
: "${WEB_EXT_API_SECRET:?no AMO secret resolved}"

echo "Running tests…"
node --test test/*.test.js

echo "Linting…"
npx --yes web-ext lint --source-dir .

echo "Submitting to AMO (listed channel)…"
# --channel=listed uploads and submits a new version for review. The signed
# .xpi lands in web-ext-artifacts/ once/if AMO auto-approves; a listed addon
# still needs its listing page (summary, description, screenshots, categories)
# completed on the AMO dashboard before review can finish.
#
# The credentials go in as argv here because web-ext offers no stdin path —
# they are visible to `ps` for the duration of the upload. That is the one
# unavoidable exposure in this flow.
#
# --amo-metadata carries the license: a listed version is rejected without one
# (400, "This field, or custom_license, is required"). It matches ./LICENSE.
npx --yes web-ext sign \
  --source-dir . \
  --channel=listed \
  --amo-metadata="$(dirname "$0")/amo-metadata.json" \
  --api-key="$WEB_EXT_API_KEY" \
  --api-secret="$WEB_EXT_API_SECRET"

echo "Done. Finish the listing at https://addons.mozilla.org/developers/"
