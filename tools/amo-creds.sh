# shellcheck shell=bash
# Resolves AMO API credentials from Bitwarden into the environment.
# Sourced, not executed:  . tools/amo-creds.sh
#
# Sets WEB_EXT_API_KEY (JWT issuer) and WEB_EXT_API_SECRET (JWT secret), which
# is what web-ext reads.
#
# The credentials live as CUSTOM FIELDS on a vault item — for most people the
# same item as their Firefox Account login, since that's where AMO issues them.
# Rather than hardcode an item name (this repo is public, and the name is a
# detail of someone's vault), we locate the item by the field names themselves:
# exactly one item should carry both.
#
# Override the field names if yours differ:
#   AMO_ISSUER_FIELD="JWT Issuer" AMO_SECRET_FIELD="JWT Secret" . tools/amo-creds.sh
#
# No value is ever echoed or passed through argv (argv is world-readable via
# `ps`); everything moves through pipes and shell variables.

command -v bw >/dev/null || { echo "bw (Bitwarden CLI) not found" >&2; return 1; }
command -v jq >/dev/null || { echo "jq not found" >&2; return 1; }

: "${AMO_ISSUER_FIELD:=JWT Issuer}"
: "${AMO_SECRET_FIELD:=JWT Secret}"

if [ -z "${BW_SESSION:-}" ]; then
  echo "Unlocking Bitwarden — expect a Touch ID prompt." >&2
  BW_SESSION=$(bwbio unlock --raw) || return 1
  export BW_SESSION
fi
bw sync >/dev/null || return 1

# One `bw list` pass, filtered in jq. Items are held in a shell variable and
# never printed; only the match COUNT is ever surfaced.
_amo_matches=$(
  bw list items 2>/dev/null | jq -c --arg iss "$AMO_ISSUER_FIELD" --arg sec "$AMO_SECRET_FIELD" '
    [ .[]
      | (.fields // []) as $f
      | select(($f | map(.name) | index($iss)) != null and ($f | map(.name) | index($sec)) != null)
      | { issuer: ($f[] | select(.name == $iss) | .value)
        , secret: ($f[] | select(.name == $sec) | .value)
        }
    ]'
) || { echo "Could not read the Bitwarden vault." >&2; return 1; }

_amo_count=$(printf '%s' "$_amo_matches" | jq 'length')

if [ "$_amo_count" -eq 0 ]; then
  echo "No vault item carries both \"$AMO_ISSUER_FIELD\" and \"$AMO_SECRET_FIELD\" custom fields." >&2
  echo "Generate credentials at https://addons.mozilla.org/en-US/developers/addon/api/key/" >&2
  echo "and add them as custom fields on your Firefox Account item." >&2
  unset _amo_matches _amo_count
  return 1
fi
if [ "$_amo_count" -gt 1 ]; then
  echo "$_amo_count vault items carry those fields; can't tell which is the AMO key." >&2
  echo "Remove the duplicate, or rename the fields and set AMO_ISSUER_FIELD/AMO_SECRET_FIELD." >&2
  unset _amo_matches _amo_count
  return 1
fi

WEB_EXT_API_KEY=$(printf '%s' "$_amo_matches" | jq -r '.[0].issuer')
WEB_EXT_API_SECRET=$(printf '%s' "$_amo_matches" | jq -r '.[0].secret')
export WEB_EXT_API_KEY WEB_EXT_API_SECRET
unset _amo_matches _amo_count

if [ -z "$WEB_EXT_API_KEY" ] || [ "$WEB_EXT_API_KEY" = "null" ] ||
   [ -z "$WEB_EXT_API_SECRET" ] || [ "$WEB_EXT_API_SECRET" = "null" ]; then
  echo "Found the item, but one of the two fields is empty." >&2
  unset WEB_EXT_API_KEY WEB_EXT_API_SECRET
  return 1
fi

# A JWT issuer looks like user:12345678:123. Catching a swapped pair here beats
# a bare 401 from AMO after the upload has already started.
case "$WEB_EXT_API_KEY" in
  user:*:*) : ;;
  *) echo "Warning: \"$AMO_ISSUER_FIELD\" doesn't look like a JWT issuer (user:NNNN:NN)." >&2
     echo "The issuer and secret may be swapped." >&2 ;;
esac
