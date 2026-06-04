"""
Wire webhooks + anonymous submissions for the 3 PHD forms.
Finds each form by title, registers the REST service, enables anonymous.

Usage (PowerShell):
    $env:KOBO_TOKEN = "your-kobo-api-token"
    $env:KOBO_WEBHOOK_SECRET = "your-railway-kobo-webhook-secret"
    python kobo_wire.py
"""
import os, sys
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

# title in Kobo → webhook slug
FORMS = [
    ("PHD 1 — FSW Registration",    "phd_registration_v1"),
    ("PHD 2 — Patient Services",    "phd_patient_services_v1"),
    ("PHD 3 — Activity & Operations","phd_activity_ops_v1"),
]

def find_uid(title):
    r = requests.get(f"{API}/assets/", headers=H, params={"limit":200})
    for a in r.json().get("results",[]):
        if a.get("name") == title:
            return a["uid"]
    return None

def wire_webhook(uid, slug):
    endpoint = f"{APP}/webhook/programs/form/{slug}/"
    # remove existing hook to same endpoint
    ex = requests.get(f"{API}/assets/{uid}/hooks/", headers=H)
    for h in ex.json().get("results",[]):
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
    if r.status_code not in (200,201):
        print(f"  WARN webhook: {r.status_code} {r.text[:120]}")
    return endpoint

def allow_anon(uid):
    r = requests.post(f"{API}/assets/{uid}/permission-assignments/", headers=H, json={
        "user": f"{BASE}/api/v2/users/AnonymousUser/",
        "permission": f"{BASE}/api/v2/permissions/add_submissions/",
    })
    if r.status_code not in (200,201,400):
        print(f"  WARN anon: {r.status_code} {r.text[:80]}")

print()
for title, slug in FORMS:
    uid = find_uid(title)
    if not uid:
        print(f"  NOT FOUND: {title}")
        continue
    ep = wire_webhook(uid, slug)
    allow_anon(uid)
    print(f"  OK  {title}")
    print(f"      uid     : {uid}")
    print(f"      webhook : {ep}")
    print(f"      anon    : enabled")
    print()
print("Done.")
