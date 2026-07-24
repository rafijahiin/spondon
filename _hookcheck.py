"""Every deployed form: does it have an active webhook, where does it point,
and are deliveries succeeding — especially since the case_hash fix went live
(2026-07-24 ~21:30 Dhaka)?"""
import sys, io, os, requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
H = {"Authorization": "Token " + os.environ["KOBO_TOKEN"]}
B = "https://kf.kobotoolbox.org/api/v2"
FIX_TIME = "2026-07-24T15:30"      # UTC ~= 21:30 Dhaka, when the fix deployed

assets = requests.get("%s/assets/?limit=300&format=json" % B, headers=H, timeout=200).json()
problems = []
print("%-42s %5s %6s %6s %6s  %s" % ("FORM", "subs", "ok", "fail", "pend", "since-fix"))
for a in sorted(assets.get("results", []), key=lambda x: (x.get("name") or "")):
    if not a.get("has_deployment"):
        continue
    uid = a["uid"]
    name = (a.get("name") or "")[:42]
    hooks = requests.get("%s/assets/%s/hooks/?format=json" % (B, uid),
                         headers=H, timeout=60).json().get("results", [])
    active = [h for h in hooks if h.get("active")]
    if not active:
        print("%-42s %5d %6s %6s %6s  NO ACTIVE WEBHOOK" %
              (name, a.get("deployment__submission_count", 0), "-", "-", "-"))
        problems.append((name, "no active webhook"))
        continue
    for hk in active:
        ok = int(hk.get("success_count") or 0)
        fail = int(hk.get("failed_count") or 0)
        pend = int(hk.get("pending_count") or 0)
        # deliveries after the fix
        logs = requests.get("%s/assets/%s/hooks/%s/logs/?format=json&limit=100"
                            % (B, uid, hk["uid"]), headers=H, timeout=120).json().get("results", [])
        recent = [l for l in logs if (l.get("date_modified") or "") > FIX_TIME]
        r_ok = sum(1 for l in recent if l.get("status_code") in (200, 201))
        r_bad = [l for l in recent if l.get("status_code") not in (200, 201)]
        tag = ("%d ok / %d FAILED" % (r_ok, len(r_bad))) if recent else "no traffic yet"
        endpoint_ok = "web-production-091fa" in (hk.get("endpoint") or "")
        print("%-42s %5d %6d %6d %6d  %s%s" %
              (name, a.get("deployment__submission_count", 0), ok, fail, pend, tag,
               "" if endpoint_ok else "  !! WRONG ENDPOINT: " + str(hk.get("endpoint"))[:50]))
        if r_bad:
            problems.append((name, "%d failures since fix" % len(r_bad)))
            for l in r_bad[:2]:
                print("        FAIL %s status=%s %s" %
                      (l.get("date_modified", "")[:19], l.get("status_code"),
                       str(l.get("message"))[:80]))
        if not endpoint_ok:
            problems.append((name, "wrong endpoint"))
        if pend:
            problems.append((name, "%d stuck pending" % pend))

print("\n%s" % ("ALL CLEAR — every form has an active webhook and no failures since the fix"
                if not problems else "PROBLEMS: %s" % problems))
