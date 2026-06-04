import os, sys
try:
    import requests
except ImportError:
    sys.exit("pip install requests")

TOKEN = os.environ.get("KOBO_TOKEN", "").strip()
if not TOKEN:
    sys.exit("Set $env:KOBO_TOKEN first")

H = {"Authorization": f"Token {TOKEN}"}
r = requests.get("https://kf.kobotoolbox.org/api/v2/assets/?limit=200", headers=H)
assets = r.json().get("results", [])
if not assets:
    print("Nothing to delete.")
    sys.exit(0)
for a in assets:
    d = requests.delete(f"https://kf.kobotoolbox.org/api/v2/assets/{a['uid']}/", headers=H)
    print("deleted" if d.status_code == 204 else f"FAILED {d.status_code}", a["name"])
print("Done.")
