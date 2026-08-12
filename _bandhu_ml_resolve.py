# -*- coding: utf-8 -*-
"""Resolve every Bandhu Mother List id that is currently shared by two people.

Idempotent and re-runnable. Reads the live state each time, so it can be run
again whenever the field produces a fresh collision — which it will, until the
serial stops being typed by hand (see the note at the bottom of this file).

Rule: the submission Spondon already holds KEEPS the id, so no existing client
changes id and no service record needs re-attributing. Every other submission
under that id gets the next free serial for its centre and is pushed to the
webhook so Spondon creates it.

Usage: KOBO_TOKEN=... KOBO_WEBHOOK_SECRET=... DBURL=... python _bandhu_ml_resolve.py [--apply]
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

import psycopg

TOKEN = os.environ.get("KOBO_TOKEN", "").strip()
SECRET = os.environ.get("KOBO_WEBHOOK_SECRET", "").strip()
DBURL = os.environ.get("DBURL", "").strip()
if not (TOKEN and SECRET and DBURL):
    sys.exit("KOBO_TOKEN, KOBO_WEBHOOK_SECRET and DBURL must be set")

UID = "ar4muzSPxzhqd9XxVvWXjx"
API = f"https://kf.kobotoolbox.org/api/v2/assets/{UID}"
HOOK = ("https://web-production-091fa.up.railway.app"
        "/webhook/programs/form/bandhu_mother_list_v1/")
APPLY = "--apply" in sys.argv


def call(method, url, body=None, token=TOKEN, tries=5):
    for n in range(tries):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            url, data=data, method=method,
            headers={"Authorization": "Token " + token,
                     "Content-Type": "application/json",
                     "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=90) as f:
                raw = f.read().decode() or "{}"
                try:
                    return f.status, json.loads(raw)
                except ValueError:
                    return f.status, raw[:300]
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()[:300]
        except Exception as e:
            if n == tries - 1:
                return 0, str(e)[:160]
            time.sleep(3 * (n + 1))


def db(tries=6):
    for n in range(tries):
        try:
            return psycopg.connect(DBURL, connect_timeout=30)
        except Exception:
            if n == tries - 1:
                raise
            time.sleep(4 * (n + 1))


def pull():
    rows, start = [], 0
    while True:
        st, d = call("GET", f"{API}/data/?format=json&limit=1000&start={start}")
        if st != 200:
            sys.exit(f"could not read Kobo: {st} {str(d)[:120]}")
        rows.extend(d["results"])
        if not d.get("next"):
            break
        start += 1000
        time.sleep(0.4)
    return rows


def main():
    rows = pull()
    g = {}
    for r in rows:
        m = str(r.get("grp_ml/ml_id_no") or "").strip().upper()
        if m:
            g.setdefault(m, []).append(r)
    shared = {k: v for k, v in g.items() if len(v) > 1}
    print(f"live: {len(rows)} submissions, {len(g)} ids, {len(shared)} shared")
    if not shared:
        print("nothing to resolve")
        return

    sids = [str(x["_id"]) for v in shared.values() for x in v]
    with db() as cn, cn.cursor() as cur:
        cur.execute("""select kobo_submission_id, client_id from programs_client
                       where kobo_submission_id = any(%s)""", (sids,))
        held = {str(k): c for k, c in cur.fetchall()}
        cur.execute("select client_id from programs_client where organisation='Bandhu'")
        taken = {}
        for (cid,) in cur.fetchall():
            if cid and "-" in cid:
                a, b = cid.split("-", 1)
                if b.isdigit():
                    taken.setdefault(a, set()).add(int(b))
    for mid in g:
        if "-" in mid:
            a, b = mid.split("-", 1)
            if b.isdigit():
                taken.setdefault(a, set()).add(int(b))

    def alloc(c):
        n = max(taken.get(c, {0})) + 1
        while n in taken.setdefault(c, set()):
            n += 1
        taken[c].add(n)
        return f"{c}-{n:04d}"

    todo = []
    for mid, v in sorted(shared.items()):
        keep = next((x for x in v if str(x["_id"]) in held), None)
        if keep is None:
            v.sort(key=lambda z: z["_submission_time"])
            keep = v[0]
        for x in v:
            if x is keep:
                continue
            todo.append({"sid": x["_id"], "old": mid,
                         "new": alloc(mid.split("-")[0])})
    print(f"to renumber: {len(todo)}")
    for t in todo:
        print(f"   {t['old']} -> {t['new']}  (sid {t['sid']})")
    if not APPLY:
        print("run with --apply to execute")
        return

    for t in todo:
        st, _ = call("PATCH", f"{API}/data/bulk/",
                     {"payload": {"submission_ids": [str(t["sid"])],
                                  "data": {"grp_ml/ml_serial": t["new"].split("-")[1],
                                           "grp_ml/ml_id_no": t["new"]}}})
        time.sleep(1)
        st2, sub = call("GET", f"{API}/data/{t['sid']}/?format=json")
        hook = "-"
        if st2 == 200 and isinstance(sub, dict):
            hook, _ = call("POST", HOOK, sub, token=SECRET)
        print(f"   {t['old']} -> {t['new']}  patch={st} hook={hook}")
        time.sleep(0.6)


if __name__ == "__main__":
    main()

# NOTE ON THE ROOT CAUSE
# ----------------------
# ml_serial is a hand-typed 4-digit text field; ml_id_no is
# concat(centre_district_code, '-', ml_serial). Since July 2026 the field has a
# hard constraint refusing a serial already present in bandhu_clients.csv, but
# that CSV is a SNAPSHOT pushed from Spondon and only refreshed when a device
# re-downloads the form. Two peer educators registering different people in the
# same sitting therefore cannot see each other's brand-new number, and neither
# is blocked. 77 of the 97 collisions cleaned up on 2026-08-06 were made on the
# same calendar day as the record they collided with, and 63 involved two
# different enumerators. No snapshot cadence closes this; the serial has to be
# allocated server-side, where the highest number per centre is already known.
