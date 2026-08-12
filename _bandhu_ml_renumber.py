# -*- coding: utf-8 -*-
"""Give every Bandhu Mother List registration a unique beneficiary ID.

Background
----------
`ml_id_no` is `centre_district_code + '-' + ml_serial`, and ml_serial is typed
by hand. Several peer educators at the same centre start counting from 0001 on
the same day, so 68 IDs ended up shared by 2-6 different people.

`handle_bandhu_mother_list` keeps the FIRST registration to reach the webhook
and ignores the rest, so the losers were never created in Spondon at all. They
are real, distinct people with no record anywhere.

What this does
--------------
1. renumber : the submissions that are a DIFFERENT person from the one Spondon
              already holds get the next free serial for their centre, then are
              re-posted to the webhook so Spondon creates them.
2. delete   : submissions that are genuinely the SAME person as the keeper.
3. hold     : anything the matcher could not decide is left alone and printed.

The keeper is always whichever submission Spondon already has, so no existing
client changes id and no service record has to be re-attributed.

Usage:  KOBO_TOKEN=... KOBO_WEBHOOK_SECRET=... python _bandhu_ml_renumber.py [--apply]
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

TOKEN = os.environ.get("KOBO_TOKEN", "").strip()
SECRET = os.environ.get("KOBO_WEBHOOK_SECRET", "").strip()
if not TOKEN or not SECRET:
    sys.exit("KOBO_TOKEN and KOBO_WEBHOOK_SECRET must be set")

UID = "ar4muzSPxzhqd9XxVvWXjx"
API = f"https://kf.kobotoolbox.org/api/v2/assets/{UID}"
HOOK = ("https://web-production-091fa.up.railway.app"
        "/webhook/programs/form/bandhu_mother_list_v1/")
TMP = os.environ.get("TEMP", ".")
PLAN = os.path.join(TMP, "ml_plan.json")
RESULTS = os.path.join(TMP, "ml_results.json")
APPLY = "--apply" in sys.argv

# One enumerator typed -1 children (once in 2400 submissions; blank is a valid
# answer and the DB has CHECK children_under_18 >= 0). Blank it rather than
# invent a number.
FIX_VALUES = {797375234: {"grp_ml/ml_children_u18": ""}}


def call(method, url, body=None, token=TOKEN, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Authorization": "Token " + token,
                 "Content-Type": "application/json",
                 "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as f:
            raw = f.read().decode() or "{}"
            try:
                return f.status, json.loads(raw)
            except ValueError:
                return f.status, raw[:300]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
    except Exception as e:                       # network/timeout
        return 0, str(e)[:200]


def patch(sid, data):
    return call("PATCH", f"{API}/data/bulk/",
                {"payload": {"submission_ids": [str(sid)], "data": data}})


def fetch(sid):
    return call("GET", f"{API}/data/{sid}/?format=json")


def push(sub):
    return call("POST", HOOK, sub, token=SECRET)


def main():
    plan = json.load(open(PLAN))
    renum, delete, hold = plan["renumber"], plan["delete"], plan["hold"]
    print(f"plan: renumber={len(renum)} delete={len(delete)} hold={len(hold)} "
          f"| mode={'APPLY' if APPLY else 'DRY RUN'}")
    if hold:
        print("HOLD (left untouched, needs a human):")
        for h in hold:
            print("   ", h)
    if not APPLY:
        for r in renum[:5]:
            print(f"   would set {r['old']} -> {r['new']}  (sid {r['sid']})")
        print("   ... run with --apply to execute")
        return

    out = {"renumber": [], "delete": []}
    for i, r in enumerate(renum, 1):
        sid, new = r["sid"], r["new"]
        rec = {"sid": sid, "old": r["old"], "new": new}
        data = {"grp_ml/ml_serial": new.split("-")[1],
                "grp_ml/ml_id_no": new}
        data.update(FIX_VALUES.get(sid, {}))
        st, resp = fetch(sid)
        already = isinstance(resp, dict) and resp.get("grp_ml/ml_id_no") == new
        if not already:
            st, resp = patch(sid, data)
            rec["patch"] = st
            if st != 200:
                rec["patch_error"] = resp
                out["renumber"].append(rec)
                print(f"  [{i}/{len(renum)}] {sid} PATCH FAILED {st}")
                continue
            time.sleep(0.6)
        elif FIX_VALUES.get(sid):
            patch(sid, FIX_VALUES[sid])
            time.sleep(0.6)
        else:
            rec["patch"] = "already"
        st, sub = fetch(sid)
        if st != 200 or not isinstance(sub, dict):
            rec["fetch_error"] = (st, sub)
            out["renumber"].append(rec)
            continue
        rec["kobo_id_now"] = sub.get("grp_ml/ml_id_no")
        st, resp = push(sub)
        rec["hook"] = st
        if st >= 400:
            rec["hook_error"] = resp
        out["renumber"].append(rec)
        print(f"  [{i}/{len(renum)}] {r['old']} -> {rec['kobo_id_now']}  hook={st}")
        time.sleep(0.5)
        if i % 20 == 0:
            json.dump(out, open(RESULTS, "w"), indent=1)

    json.dump(out, open(RESULTS, "w"), indent=1)
    ok = sum(1 for r in out["renumber"] if r.get("hook") in (200, 201))
    print(f"\nrenumbered and pushed OK: {ok}/{len(renum)}")
    bad = [r for r in out["renumber"] if r.get("hook") not in (200, 201)]
    if bad:
        print("failures:")
        for r in bad[:12]:
            print("   ", r)


if __name__ == "__main__":
    main()
