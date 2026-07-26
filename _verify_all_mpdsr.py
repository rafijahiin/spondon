"""Form-by-form verification of every MPDSR asset.

For each: (1) the webhook's exact endpoint slug — a wrong slug mislabels every
row; (2) the form's actual field names for kind/place/cause; (3) the tabulated
VALUES actually submitted; so each can be diffed against what the handlers
assume and what the dashboard claims.
"""
import sys, io, os, collections, requests
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
H = {"Authorization": "Token " + os.environ["KOBO_TOKEN"]}
B = "https://kf.kobotoolbox.org/api/v2"

ASSETS = [
    ("F-01 Community Maternal", "apvPk7qq94nry2aW3z7y4H"),
    ("F-02 Community Neonatal", "awQXeYhuLoLrM38fwSrF8y"),
    ("F-04 Facility Maternal", "aVQbxhGnDHNCe6AazSJByM"),
    ("F-05 Facility Neonatal", "a6pg47mTt8E56igHnK8SSD"),
    ("Social Autopsy", "a6vQiCJ3tz4MRxKqdMHCbA"),
    ("Slip 01", "aSnEgQT6DUooVanZXubhAF"),
    ("Slip 02", "aaCnfRHHgkukkhDgXwUnXX"),
    ("Response Plan", "auFCf7bfBDtrP6xeW5F2KJ"),
]

INTEREST = ("death_kind", "death_type", "place_of_death", "death_place", "kind",
            "slip", "facility", "cause", "icd", "cod_")

for name, uid in ASSETS:
    a = requests.get("%s/assets/%s/?format=json" % (B, uid), headers=H, timeout=120).json()
    hooks = requests.get("%s/assets/%s/hooks/?format=json" % (B, uid),
                         headers=H, timeout=60).json().get("results", [])
    print("=" * 88)
    print("%s  (%s)  title=%r" % (name, uid, a.get("name", "")[:60]))
    for hk in hooks:
        if hk.get("active"):
            print("   HOOK -> %s" % hk.get("endpoint"))

    # form fields of interest, with choices
    choices = collections.defaultdict(list)
    for c in (a.get("content") or {}).get("choices", []):
        lab = c.get("label")
        choices[c["list_name"]].append(
            (str(c.get("name")), (lab[0] if isinstance(lab, list) and lab else lab or "")[:40]))
    for q in (a.get("content") or {}).get("survey", []):
        n = q.get("name") or ""
        if any(t in n.lower() for t in INTEREST):
            lab = q.get("label")
            lab = (lab[0] if isinstance(lab, list) and lab else lab or "")[:70]
            print("   FIELD %-24s %-14s %s" % (n, q.get("type", ""), lab))
            lst = q.get("select_from_list_name")
            if lst and lst in choices:
                print("         choices: %s" % choices[lst])

    # actual submitted values
    subs = requests.get("%s/assets/%s/data/?limit=1000" % (B, uid),
                        headers=H, timeout=180).json()["results"]
    vals = collections.defaultdict(collections.Counter)
    for s in subs:
        for k, v in s.items():
            leaf = k.split("/")[-1]
            if any(t in leaf.lower() for t in INTEREST) and not leaf.startswith("_"):
                vals[leaf][str(v)[:30]] += 1
    print("   SUBMITTED n=%d" % len(subs))
    for leaf in sorted(vals):
        print("     %-24s %s" % (leaf, dict(vals[leaf].most_common(8))))
