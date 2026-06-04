"""Delete ALL assets/forms in the Kobo account. Irreversible."""
import os, sys
try:
    import requests
except ImportError:
    sys.exit("pip install requests")

BASE  = os.environ.get("KOBO_BASE", "https://kf.kobotoolbox.org").rstrip("/")
TOKEN = os.environ.get("KOBO_TOKEN", "").strip()
if not TOKEN:
    sys.exit("KOBO_TOKEN not set")

H   = {"Authorization": f"Token {TOKEN}"}
API = f"{BASE}/api/v2"

r = requests.get(f"{API}/assets/", headers=H, params={"limit": 200})
if r.status_code != 200:
    sys.exit(f"Could not list assets: {r.status_code} {r.text[:200]}")

assets = r.json().get("results", [])
if not assets:
    print("No forms found — account already empty.")
    sys.exit(0)

print(f"Deleting {len(assets)} form(s)...")
for a in assets:
    uid   = a["uid"]
    name  = a.get("name", uid)
    resp  = requests.delete(f"{API}/assets/{uid}/", headers=H)
    if resp.status_code == 204:
        print(f"  deleted  {name} ({uid})")
    else:
        print(f"  FAILED   {name} ({uid})  HTTP {resp.status_code}: {resp.text[:120]}")

print("Done.")
