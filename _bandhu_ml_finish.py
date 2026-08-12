# -*- coding: utf-8 -*-
"""Finish the Bandhu Mother List clean-up: strays, deletions, reconciliation.

Run after _bandhu_ml_renumber.py. Safe to re-run; every step checks state
first and skips what is already correct.

  1. retry any renumber that did not land (network flakiness on the first pass)
  2. delete the submissions that are genuinely the SAME person as the keeper,
     but only after proving that submission is not the one Spondon holds
  3. reconcile: report Kobo vs Spondon and any collision that survives

Usage: KOBO_TOKEN=... KOBO_WEBHOOK_SECRET=... DBURL=... python _bandhu_ml_finish.py [--apply]
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
TMP = os.environ.get("TEMP", ".")
PLAN = json.load(open(os.path.join(TMP, "ml_plan.json")))
APPLY = "--apply" in sys.argv


def call(method, url, body=None, token=TOKEN, tries=4):
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
    """The Railway proxy and Kobo both drop connections intermittently from
    this network, so every hop retries rather than aborting a half-done run."""
    for n in range(tries):
        try:
            return psycopg.connect(DBURL, connect_timeout=30)
        except Exception:
            if n == tries - 1:
                raise
            time.sleep(4 * (n + 1))


# ── 1. strays ────────────────────────────────────────────────────────────
def fix_strays():
    with db() as cn, cn.cursor() as cur:
        cur.execute("select client_id from programs_client where organisation='Bandhu'")
        have = {r[0] for r in cur.fetchall()}
    todo = [r for r in PLAN["renumber"] if r["new"] not in have]
    print(f"[1] renumbers not yet in Spondon: {len(todo)}")
    if not todo or not APPLY:
        return
    for r in todo:
        st, sub = call("GET", f"{API}/data/{r['sid']}/?format=json")
        if st != 200 or not isinstance(sub, dict):
            print(f"    {r['sid']} fetch failed {st}")
            continue
        if sub.get("grp_ml/ml_id_no") != r["new"]:
            st, _ = call("PATCH", f"{API}/data/bulk/",
                         {"payload": {"submission_ids": [str(r["sid"])],
                                      "data": {"grp_ml/ml_serial": r["new"].split("-")[1],
                                               "grp_ml/ml_id_no": r["new"]}}})
            print(f"    {r['sid']} re-patched -> {r['new']} ({st})")
            time.sleep(1)
            st, sub = call("GET", f"{API}/data/{r['sid']}/?format=json")
        st, resp = call("POST", HOOK, sub, token=SECRET)
        print(f"    {r['old']} -> {r['new']}  hook={st}")
        time.sleep(0.6)


# ── 2. deletions ─────────────────────────────────────────────────────────
def delete_dups():
    dele = PLAN["delete"]
    sids = [str(d["sid"]) for d in dele]
    with db() as cn, cn.cursor() as cur:
        cur.execute("""select kobo_submission_id, client_id from programs_client
                       where kobo_submission_id = any(%s)""", (sids,))
        held = dict(cur.fetchall())
    unsafe = [d for d in dele if str(d["sid"]) in held]
    safe = [d for d in dele if str(d["sid"]) not in held]
    print(f"[2] true duplicates to delete: {len(dele)} "
          f"| safe: {len(safe)} | held by Spondon (SKIP): {len(unsafe)}")
    for d in unsafe:
        print(f"    SKIP {d['sid']} — Spondon holds it as {held[str(d['sid'])]}")
    if not APPLY:
        for d in safe[:20]:
            print(f"    would delete sid={d['sid']} (duplicate of {d['keeper']} "
                  f"under {d['old']})")
        return
    done = 0
    for d in safe:
        st, resp = call("DELETE", f"{API}/data/{d['sid']}/")
        ok = st in (200, 202, 204)
        done += ok
        print(f"    delete {d['sid']} ({d['old']}) -> {st}{'' if ok else ' ' + str(resp)[:90]}")
        time.sleep(0.5)
    print(f"    deleted {done}/{len(safe)}")


# ── 3. reconciliation ────────────────────────────────────────────────────
def reconcile():
    rows, start = [], 0
    while True:
        st, d = call("GET", f"{API}/data/?format=json&limit=1000&start={start}")
        if st != 200 or not isinstance(d, dict):
            print("[3] could not read Kobo:", st, str(d)[:120])
            return
        rows.extend(d["results"])
        if not d.get("next"):
            break
        start += 1000
        time.sleep(0.4)
    g = {}
    for r in rows:
        m = str(r.get("grp_ml/ml_id_no") or "").strip().upper()
        if m:
            g.setdefault(m, []).append(r["_id"])
    dups = {k: v for k, v in g.items() if len(v) > 1}
    with db() as cn, cn.cursor() as cur:
        cur.execute("select client_id from programs_client where organisation='Bandhu'")
        clients = {r[0] for r in cur.fetchall()}
    print(f"\n[3] RECONCILIATION")
    print(f"    Kobo submissions          : {len(rows)}")
    print(f"    distinct beneficiary ids  : {len(g)}")
    print(f"    ids still shared          : {len(dups)} {dict(list(dups.items())[:6])}")
    print(f"    Spondon Bandhu clients    : {len(clients)}")
    print(f"    in Kobo but NOT in Spondon: {len(set(g) - clients)} "
          f"{sorted(set(g) - clients)[:10]}")
    print(f"    in Spondon but NOT in Kobo: {len(clients - set(g))} "
          f"(service-log stubs and pre-Kobo records)")


if __name__ == "__main__":
    print("mode =", "APPLY" if APPLY else "DRY RUN")
    fix_strays()
    delete_dups()
    reconcile()
