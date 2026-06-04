"""Delete PHD 2 & PHD 3 from Kobo, upload the merged PHD-2 Service Log fresh,
deploy it, wire the webhook, enable anonymous submissions.

Usage:
    $env:KOBO_TOKEN = "your-kobo-api-token"
    $env:KOBO_WEBHOOK_SECRET = "your-railway-kobo-webhook-secret"
    python kobo_phd_remerge.py
"""
import os, sys, time
try:
    import requests
except ImportError:
    sys.exit("pip install requests")

TOKEN  = os.environ.get("KOBO_TOKEN","").strip()
SECRET = os.environ.get("KOBO_WEBHOOK_SECRET","").strip()
if not TOKEN:  sys.exit("KOBO_TOKEN not set")
if not SECRET: sys.exit("KOBO_WEBHOOK_SECRET not set")

BASE = "https://kf.kobotoolbox.org"
API  = f"{BASE}/api/v2"
APP  = "https://web-production-091fa.up.railway.app"
H    = {"Authorization": f"Token {TOKEN}"}

XLSX = r"C:/Users/HP/Documents/koboforms/PHD-2_Service_Log.xlsx"
TITLES_TO_DROP = ['PHD 2 — Patient Services', 'PHD 3 — Activity & Operations']
NEW_TITLE = 'PHD 2 — Service Log'
NEW_SLUG  = 'phd_service_log_v1'


def find_by_title(title):
    r = requests.get(f"{API}/assets/", headers=H, params={"limit": 200})
    for a in r.json().get("results", []):
        if a.get("name") == title:
            return a["uid"]
    return None


def delete_asset(uid):
    r = requests.delete(f"{API}/assets/{uid}/", headers=H)
    return r.status_code == 204


def import_form(path, title):
    with open(path, "rb") as fh:
        files = {"file": (os.path.basename(path), fh,
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        data = {"library": "false", "name": title}
        r = requests.post(f"{API}/imports/", headers=H, files=files, data=data)
    if r.status_code not in (200, 201):
        print(f"  import FAIL: {r.status_code} {r.text[:200]}"); return None
    imp_url = r.json().get("url") or f"{API}/imports/{r.json()['uid']}/"
    for _ in range(40):
        time.sleep(1.5)
        s = requests.get(imp_url, headers=H)
        if s.status_code != 200: continue
        body = s.json()
        if body.get("status") == "complete":
            for key in ("created", "updated"):
                items = body.get("messages", {}).get(key) or []
                if items and items[0].get("uid"):
                    return items[0]["uid"]
            return find_by_title(title)
        if body.get("status") in ("error","errored"):
            print(f"  import error: {body}"); return None
    return None


def deploy(uid):
    asset = requests.get(f"{API}/assets/{uid}/", headers=H).json()
    vid = asset.get("version_id")
    r = requests.post(f"{API}/assets/{uid}/deployment/", headers=H,
                      json={"active": True, "version_id": vid})
    if r.status_code in (200, 201): return True
    r2 = requests.patch(f"{API}/assets/{uid}/deployment/", headers=H,
                        json={"active": True, "version_id": vid})
    return r2.status_code in (200, 201)


def wire_webhook(uid, slug):
    endpoint = f"{APP}/webhook/programs/form/{slug}/"
    # drop existing hook to same endpoint if any
    ex = requests.get(f"{API}/assets/{uid}/hooks/", headers=H).json()
    for h in ex.get("results", []):
        if h.get("endpoint") == endpoint:
            requests.delete(f"{API}/assets/{uid}/hooks/{h['uid']}/", headers=H)
    r = requests.post(f"{API}/assets/{uid}/hooks/", headers=H, json={
        "name": "SIMPLE Railway",
        "endpoint": endpoint,
        "active": True,
        "export_type": "json",
        "email_notification": False,
        "settings": {"custom_headers": {"Authorization": f"Token {SECRET}"}},
    })
    return endpoint if r.status_code in (200, 201) else None


def allow_anon(uid):
    r = requests.post(f"{API}/assets/{uid}/permission-assignments/", headers=H, json={
        "user": f"{BASE}/api/v2/users/AnonymousUser/",
        "permission": f"{BASE}/api/v2/permissions/add_submissions/",
    })
    return r.status_code in (200, 201, 400)


print()
# 1. Delete the old PHD 2 + PHD 3
for title in TITLES_TO_DROP:
    uid = find_by_title(title)
    if uid:
        ok = delete_asset(uid)
        print(f"  delete  {title:<45} {'OK' if ok else 'FAIL'}")
    else:
        print(f"  delete  {title:<45} (not found)")

# 2. Make sure the new title doesn't already exist (idempotent)
existing = find_by_title(NEW_TITLE)
if existing:
    delete_asset(existing)
    print(f"  delete  {NEW_TITLE:<45} (old copy)")

# 3. Upload the new merged form fresh
if not os.path.exists(XLSX):
    sys.exit(f"\nXLSX not found: {XLSX}\nRun: python manage.py build_phd_forms")
uid = import_form(XLSX, NEW_TITLE)
if not uid:
    sys.exit("import failed")
print(f"\n  imported   {NEW_TITLE}  →  uid {uid}")
if deploy(uid):
    print(f"  deployed")
endpoint = wire_webhook(uid, NEW_SLUG)
print(f"  webhook    {endpoint}")
if allow_anon(uid):
    print(f"  anon       enabled")
print(f"  collect    {BASE}/#/forms/{uid}/landing")
print("\nDone.")
