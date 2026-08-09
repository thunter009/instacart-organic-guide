#!/usr/bin/env bash
# Store the addons.mozilla.org API credentials in Bitwarden as "AMO API key",
# in the shape tools/sign.sh expects (username = JWT issuer, password = secret).
#
# Run this once, after generating credentials at:
#   https://addons.mozilla.org/en-US/developers/addon/api/key/
# The JWT secret is shown exactly once on that page — copy it before navigating away.
#
# Neither value is echoed, logged, or passed as an argv element (argv is visible
# to `ps`); both go to `bw` over stdin and are unset on exit.
set -euo pipefail

trap 'unset ISSUER SECRET ITEM_JSON BW_SESSION 2>/dev/null || true' EXIT

command -v bw >/dev/null || { echo "bw (Bitwarden CLI) not found" >&2; exit 1; }

ITEM_NAME="AMO API key"

if [[ -z "${BW_SESSION:-}" ]]; then
  echo "Unlocking Bitwarden — expect a Touch ID prompt." >&2
  BW_SESSION=$(bwbio unlock --raw)
  export BW_SESSION
fi
bw sync >/dev/null

if bw get item "$ITEM_NAME" >/dev/null 2>&1; then
  echo "An item named \"$ITEM_NAME\" already exists. Delete or rename it first." >&2
  exit 1
fi

# -s: no echo. Read the issuer silently too — it identifies the account.
read -rsp "JWT issuer (user:12345678:123): " ISSUER; echo
read -rsp "JWT secret: "                    SECRET; echo

[[ -n "$ISSUER" && -n "$SECRET" ]] || { echo "Both values are required." >&2; exit 1; }

ITEM_JSON=$(
  ISSUER="$ISSUER" SECRET="$SECRET" ITEM_NAME="$ITEM_NAME" python3 - <<'PY'
import json, os
print(json.dumps({
    "type": 1,
    "name": os.environ["ITEM_NAME"],
    "notes": "addons.mozilla.org API credentials for instacart-organic-guide. "
             "Consumed by tools/sign.sh via WEB_EXT_API_KEY / WEB_EXT_API_SECRET.",
    "login": {
        "username": os.environ["ISSUER"],
        "password": os.environ["SECRET"],
        "uris": [{"uri": "https://addons.mozilla.org/en-US/developers/addon/api/key/"}],
    },
}))
PY
)

printf '%s' "$ITEM_JSON" | bw encode | bw create item >/dev/null
bw sync >/dev/null

echo "Stored \"$ITEM_NAME\" in Bitwarden. Verify with: bw get username \"$ITEM_NAME\""
echo "Next: bash tools/sign.sh"
