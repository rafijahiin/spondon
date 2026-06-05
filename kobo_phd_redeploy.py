"""Replace both PHD forms in place on Kobo (same UIDs → webhooks stay wired).

Pushes the updated .xlsx into each existing asset and redeploys so the new
version is what enumerators see. Run after any change to build_phd_forms.py.

Usage (PowerShell):
    $env:KOBO_TOKEN = "your-kobo-api-token"
    python kobo_phd_redeploy.py
"""
import os, sys, time
try:
    import requests
except ImportError:
    sys.exit("pip install requests")

TOKEN = os.environ.get("KOBO_TOKEN","").strip()
if not TOKEN: sys.exit("KOBO_TOKEN not set")

BASE = "https://kf.kobotoolbox.org"
API  = f"{BASE}/api/v2"
H    = {"Authorization": f"Token {TOKEN}"}
HERE = r"C:/Users/HP/Documents/koboforms"

FORMS = [
    ("aGWfLrP2yNXqnAiBKuvVgv", "PHD-1_Registration.xlsx",  "PHD 1 — FSW Registration"),
    ("aDv2CZapM2eSqijKr2WZKc", "PHD-2_Service_Log.xlsx",   "PHD 2 — Service Log"),
]


def replace_xlsx(uid: str, path: str) -> bool:
    """POST the new .xlsx into the existing asset via /imports/."""
    with open(path, "rb") as fh:
        files = {"file": (os.path.basename(path), fh,
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        data = {"destination": f"{API}/assets/{uid}/"}
        r = requests.post(f"{API}/imports/", headers=H, files=files, data=data, timeout=60)
    if r.status_code not in (200, 201):
        print(f"  IMPORT FAIL: {r.status_code} {r.text[:200]}"); return False
    imp_url = r.json().get("url") or f"{API}/imports/{r.json()['uid']}/"
    for _ in range(40):
        time.sleep(1.5)
        s = requests.get(imp_url, headers=H, timeout=30)
        if s.status_code != 200: continue
        st = s.json().get("status")
        if st == "complete": return True
        if st in ("error","errored"):
            print(f"  IMPORT ERROR: {s.json()}"); return False
    print("  TIMEOUT waiting for import to complete")
    return False


def deploy(uid: str) -> bool:
    """Redeploy an already-deployed asset to its latest version.

    POST /deployment/  → 405 once a deployment exists (Kobo rejects "create
                          deployment" when one is already there). Expected.
    PATCH /deployment/ {"version_id": <hash>, "active": true}
                       → the canonical redeploy call.

    The version_id must be the LATEST version's hash from
    /api/v2/assets/<uid>/versions/?limit=1 — NOT the asset.version_id
    field (which can lag right after an /imports/ post).
    """
    # Fetch the actual newest version from /versions/ — most reliable source.
    v = requests.get(f"{API}/assets/{uid}/versions/?limit=1",
                     headers=H, timeout=30)
    results = (v.json() or {}).get("results", []) if v.status_code == 200 else []
    if not results:
        print(f"  no versions for {uid}"); return False
    vhash = results[0].get("uid")
    if not vhash:
        print(f"  version has no uid: {results[0]}"); return False

    r = requests.patch(f"{API}/assets/{uid}/deployment/", headers=H,
                       json={"version_id": vhash, "active": True}, timeout=30)
    if r.status_code in (200, 201):
        return True
    print(f"  PATCH /deployment/ → {r.status_code}: {r.text[:300]}")
    # Last-resort fallback for forms with no prior deployment row.
    r2 = requests.post(f"{API}/assets/{uid}/deployment/", headers=H,
                       json={"version_id": vhash, "active": True}, timeout=30)
    if r2.status_code in (200, 201):
        return True
    print(f"  POST  /deployment/ → {r2.status_code}: {r2.text[:300]}")
    return False


print()
for uid, fname, label in FORMS:
    path = os.path.join(HERE, fname)
    if not os.path.exists(path):
        print(f"  MISSING: {path}  (run: python manage.py build_phd_forms)")
        continue
    print(f"  {label}  ({uid})")
    if replace_xlsx(uid, path):
        print("    replaced .xlsx")
    else:
        continue
    if deploy(uid):
        print("    redeployed")
    print(f"    collect (Enketo): published as-is (UID unchanged)")
print("\nDone.")
print("\nNext: re-run  python manage.py export_phd_clients --upload")
print("so phd_clients.csv is attached to the new versions for pulldata().")
