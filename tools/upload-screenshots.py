#!/usr/bin/env python3
"""Upload listing screenshots to the AMO dashboard.

    . tools/amo-creds.sh
    python3 tools/upload-screenshots.py IMAGE:CAPTION [IMAGE:CAPTION ...]

Captions are shown under each screenshot on the listing page, so they carry
real weight — a screenshot of a greyed-out grid is meaningless without one.

Credentials come from the environment (see tools/amo-creds.sh) and are used
only to sign a short-lived JWT; nothing is printed.
"""
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request

GUID = "instacart-organic-guide@users.noreply.github.com"
API = "https://addons.mozilla.org/api/v5/addons/addon/%s/previews/" % GUID


def jwt(nonce):
    key, secret = os.environ["WEB_EXT_API_KEY"], os.environ["WEB_EXT_API_SECRET"]
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=")
    now = int(time.time())
    claims = {"iss": key, "jti": "%d%s" % (now, nonce), "iat": now, "exp": now + 180}
    seg = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()) + b"." + b64(json.dumps(claims).encode())
    return (seg + b"." + b64(hmac.new(secret.encode(), seg, hashlib.sha256).digest())).decode()


def multipart(path, caption):
    """Build a multipart/form-data body. Kept hand-rolled to avoid a dependency."""
    boundary = "----amo%d" % int(time.time() * 1000)
    mime = mimetypes.guess_type(path)[0] or "image/png"
    with open(path, "rb") as fh:
        blob = fh.read()
    name = os.path.basename(path)
    body = b"".join([
        ("--%s\r\n" % boundary).encode(),
        ('Content-Disposition: form-data; name="image"; filename="%s"\r\n' % name).encode(),
        ("Content-Type: %s\r\n\r\n" % mime).encode(),
        blob, b"\r\n",
        # No caption here. Per the API docs, `position` may accompany `image`
        # but `caption` may not — it needs a separate JSON PATCH once the
        # preview exists, because multipart flattens the localized object into
        # a string and the serializer rejects it.
        ("--%s--\r\n" % boundary).encode(),
    ])
    return body, "multipart/form-data; boundary=%s" % boundary


def main(args):
    if not args:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    for env in ("WEB_EXT_API_KEY", "WEB_EXT_API_SECRET"):
        if not os.environ.get(env):
            print("%s not set — run: . tools/amo-creds.sh" % env, file=sys.stderr)
            return 1

    failed = 0
    for i, arg in enumerate(args):
        path, _, caption = arg.partition(":")
        if not os.path.isfile(path):
            print("MISSING  %s" % path, file=sys.stderr)
            failed += 1
            continue
        body, content_type = multipart(path, caption or os.path.basename(path))
        req = urllib.request.Request(
            API, data=body, method="POST",
            headers={"Authorization": "JWT " + jwt(str(i)), "Content-Type": content_type},
        )
        try:
            result = json.load(urllib.request.urlopen(req, timeout=120))
        except urllib.error.HTTPError as exc:
            print("HTTP %s  %s\n         %s" % (exc.code, path, exc.read().decode()[:300]), file=sys.stderr)
            failed += 1
            continue

        preview_id = result.get("id")
        patch = urllib.request.Request(
            "%s%s/" % (API, preview_id),
            data=json.dumps({"caption": {"en-US": caption}}).encode(), method="PATCH",
            headers={"Authorization": "JWT " + jwt("c%d" % i), "Content-Type": "application/json"},
        )
        try:
            stored = json.load(urllib.request.urlopen(patch, timeout=60))
            got = (stored.get("caption") or {}).get("en-US") or ""
            print("OK       %s -> id=%s, caption %s" % (
                path, preview_id, "set (%d chars)" % len(got) if got else "EMPTY"))
        except urllib.error.HTTPError as exc:
            print("PARTIAL  %s uploaded as id=%s but caption failed: HTTP %s %s" % (
                path, preview_id, exc.code, exc.read().decode()[:200]), file=sys.stderr)
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
