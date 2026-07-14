#!/usr/bin/env bash
# Sign + submit the extension to addons.mozilla.org (listed channel).
#
# Credentials are read from the environment and never printed. Get them from:
#   https://addons.mozilla.org/en-US/developers/addon/api/key/
# and provide them one of two ways:
#
#   A) Bitwarden (durable, survives re-signs):
#        export BW_SESSION=$(bwbio unlock --raw)
#        export WEB_EXT_API_KEY=$(bw get username "AMO API key" --raw)
#        export WEB_EXT_API_SECRET=$(bw get password "AMO API key" --raw)
#
#   B) One-off, this shell only:
#        read -rs WEB_EXT_API_KEY;    export WEB_EXT_API_KEY
#        read -rs WEB_EXT_API_SECRET; export WEB_EXT_API_SECRET
#
# Then: bash tools/sign.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${WEB_EXT_API_KEY:?set WEB_EXT_API_KEY (JWT issuer, looks like user:12345:67)}"
: "${WEB_EXT_API_SECRET:?set WEB_EXT_API_SECRET}"

echo "Linting…"
npx --yes web-ext lint --source-dir .

echo "Submitting to AMO (listed channel)…"
# --channel=listed uploads and submits a new version for review. The signed
# .xpi lands in web-ext-artifacts/ once/if AMO auto-approves; a listed addon
# still needs its listing page (summary, description, screenshots, categories)
# completed on the AMO dashboard before review can finish.
npx --yes web-ext sign \
  --source-dir . \
  --channel=listed \
  --api-key="$WEB_EXT_API_KEY" \
  --api-secret="$WEB_EXT_API_SECRET"

echo "Done. Finish the listing at https://addons.mozilla.org/developers/"
