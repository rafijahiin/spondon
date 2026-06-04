#!/usr/bin/env python
"""
One-shot KoboToolbox deployer for the 3 consolidated PHD forms.

It does EVERYTHING via the KoboToolbox KPI v2 API — no browser, no manual
upload:
    import .xlsx  ->  deploy  ->  register webhook  ->  (optional) allow
    anonymous (login-less) submissions.

WHY A SCRIPT YOU RUN (not me):
    The API needs YOUR account token — a credential. This script reads it
    from an environment variable so it never appears in the code or in any
    chat. You run it, so the credential and the sharing change stay yours.

SETUP (PowerShell):
    # 1. Your KoboToolbox API token — get it at:
    #      https://kf.kobotoolbox.org/token/?format=json   (or Account
    #      Settings -> Security -> "API token")
    $env:KOBO_TOKEN = "paste-your-kobo-api-token"

    # 2. The webhook shared secret — MUST equal Railway's KOBO_WEBHOOK_SECRET
    #    (the same value your existing forms' REST services already use).
    $env:KOBO_WEBHOOK_SECRET = "paste-the-railway-webhook-secret"

    # 3. (optional) turn ON login-less submissions for all 3 forms.
    #    Leave unset to skip; set to 1 to opt in. This is the access-control
    #    change — it only happens because YOU set this flag and run the script.
    $env:KOBO_ALLOW_ANON = "1"

    # then:
    python koboforms/kobo_deploy.py

Re-running is safe: a form already imported is detected by title and reused
(it re-deploys / re-points the webhook rather than creating duplicates).
"""
import os
import sys
import time

try:
    import requests
except ImportError:
    sys.exit("pip install requests  — then re-run.")

BASE = os.environ.get("KOBO_BASE", "https://kf.kobotoolbox.org").rstrip("/")
TOKEN = os.environ.get("KOBO_TOKEN", "").strip()
WEBHOOK_SECRET = os.environ.get("KOBO_WEBHOOK_SECRET", "").strip()
ALLOW_ANON = os.environ.get("KOBO_ALLOW_ANON", "").strip() in ("1", "true", "yes", "on")
APP_BASE = os.environ.get(
    "SIMPLE_WEBHOOK_BASE",
    "https://web-production-091fa.up.railway.app",
).rstrip("/")

HERE = os.path.dirname(os.path.abspath(__file__))

# filename, id_string slug (used in the webhook URL), human title
FORMS = [
    ("KF-PHD-1_Registration.xlsx",    "spondon_client_reg_v1",      "PHD 1 — FSW Registration (Mother List)"),
    ("KF-PHD-2_Patient_Service.xlsx", "spondon_patient_service_v1", "PHD 2 — Patient Service"),
    ("KF-PHD-3_Activity_Ops.xlsx",    "spondon_activity_ops_v1",    "PHD 3 — Activity & Operations"),
]

if not TOKEN:
    sys.exit("KOBO_TOKEN is not set. See SETUP in this file's header.")
if not WEBHOOK_SECRET:
    sys.exit("KOBO_WEBHOOK_SECRET is not set. See SETUP in this file's header.")

H = {"Authorization": f"Token {TOKEN}"}
API = f"{BASE}/api/v2"


def _die(msg, resp=None):
    if resp is not None:
        msg += f"\n  HTTP {resp.status_code}: {resp.text[:400]}"
    sys.exit("ERROR: " + msg)


def find_asset_by_title(title):
    """Return an existing asset uid with this title, or None."""
    r = requests.get(f"{API}/assets/", headers=H, params={"q": f'name:"{title}"', "limit": 200})
    if r.status_code != 200:
        return None
    for a in r.json().get("results", []):
        if a.get("name") == title:
            return a["uid"]
    return None


def import_form(path, title):
    """Import an XLSForm; return the new asset uid."""
    with open(path, "rb") as fh:
        files = {"file": (os.path.basename(path), fh,
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        data = {"library": "false", "name": title}
        r = requests.post(f"{API}/imports/", headers=H, files=files, data=data)
    if r.status_code not in (200, 201):
        _die(f"import POST failed for {title}", r)
    imp = r.json()
    imp_url = imp.get("url") or f"{API}/imports/{imp['uid']}/"

    # poll until complete
    for _ in range(40):
        time.sleep(1.5)
        s = requests.get(imp_url, headers=H)
        if s.status_code != 200:
            continue
        body = s.json()
        status = body.get("status")
        if status == "complete":
            msgs = body.get("messages", {})
            for key in ("created", "updated"):
                items = msgs.get(key) or []
                if items and items[0].get("uid"):
                    return items[0]["uid"]
            # fallback: look it up by title
            uid = find_asset_by_title(title)
            if uid:
                return uid
            _die(f"import completed but no asset uid found for {title}\n  {body}")
        if status in ("error", "errored"):
            _die(f"import failed for {title}\n  {body}")
    _die(f"import timed out for {title}")


def deploy(uid):
    # Fetch asset to get the latest version_id
    asset = requests.get(f"{API}/assets/{uid}/", headers=H)
    if asset.status_code != 200:
        _die(f"could not fetch asset {uid}", asset)
    version_id = asset.json().get("version_id") or asset.json().get("uid")

    # Try creating a new deployment first
    r = requests.post(f"{API}/assets/{uid}/deployment/", headers=H,
                      json={"active": True, "version_id": version_id})
    if r.status_code in (200, 201):
        return
    # Already deployed -> redeploy with PATCH
    r2 = requests.patch(f"{API}/assets/{uid}/deployment/", headers=H,
                        json={"active": True, "version_id": version_id})
    if r2.status_code not in (200, 201):
        _die(f"deploy failed for {uid}", r2)


def set_webhook(uid, slug):
    endpoint = f"{APP_BASE}/webhook/programs/form/{slug}/"
    payload = {
        "name": "SIMPLE (Railway)",
        "endpoint": endpoint,
        "active": True,
        "export_type": "json",
        "email_notification": False,
        "subset_fields": [],
        "settings": {"custom_headers": {"Authorization": f"Token {WEBHOOK_SECRET}"}},
    }
    # remove any existing hook to the same endpoint, then create fresh
    existing = requests.get(f"{API}/assets/{uid}/hooks/", headers=H)
    if existing.status_code == 200:
        for hook in existing.json().get("results", []):
            if hook.get("endpoint") == endpoint:
                requests.delete(f"{API}/assets/{uid}/hooks/{hook['uid']}/", headers=H)
    r = requests.post(f"{API}/assets/{uid}/hooks/", headers=H, json=payload)
    if r.status_code not in (200, 201):
        _die(f"webhook registration failed for {uid}", r)
    return endpoint


def allow_anonymous(uid):
    payload = {
        "user": f"{BASE}/api/v2/users/AnonymousUser/",
        "permission": f"{BASE}/api/v2/permissions/add_submissions/",
    }
    r = requests.post(f"{API}/assets/{uid}/permission-assignments/", headers=H, json=payload)
    # 201 created, or 400 if it already exists — both are fine
    if r.status_code not in (200, 201, 400):
        _die(f"anonymous permission failed for {uid}", r)


def main():
    print(f"\nKobo deploy -> {BASE}   (webhook target: {APP_BASE})")
    print(f"anonymous submissions: {'ENABLED' if ALLOW_ANON else 'skipped (set KOBO_ALLOW_ANON=1 to enable)'}\n")
    for filename, slug, title in FORMS:
        path = os.path.join(HERE, filename)
        if not os.path.exists(path):
            _die(f"file not found: {path}")
        print(f"• {title}")
        uid = find_asset_by_title(title)
        if uid:
            print(f"    exists (uid {uid}) — reusing")
        else:
            uid = import_form(path, title)
            print(f"    imported  -> uid {uid}")
        deploy(uid)
        print("    deployed")
        endpoint = set_webhook(uid, slug)
        print(f"    webhook   -> {endpoint}")
        if ALLOW_ANON:
            allow_anonymous(uid)
            print("    anonymous submissions allowed")
        print(f"    collect link: {BASE}/#/forms/{uid}/landing\n")
    print("Done. Open each form's 'Collect data' tab for the shareable link.\n")


if __name__ == "__main__":
    main()
