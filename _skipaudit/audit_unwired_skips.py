"""Heuristic: find questions whose LABEL prose describes a skip/conditional
but that carry NO 'relevant' logic — the Q4.8 root-cause pattern (skip written
as text, never implemented)."""
import openpyxl, sys, os, re
sys.stdout.reconfigure(encoding='utf-8')
BD = r'C:\Users\HP\Documents\koboforms_baseline'
SKIP = re.compile(r'\b(skip|go to|only (if|for|ask)|ask (only|if)|if .*(then|=|answer)|applicable|not applicable|if yes|if no|pop-?up|proceed to)\b', re.I)
NOTE_TYPES = {'note','calculate','begin_group','end_group','begin_repeat','end_repeat','start','end','today'}

def audit(path, label):
    wb = openpyxl.load_workbook(os.path.join(BD, path))
    sv = wb['survey']; hdr=[c.value for c in sv[1]]
    ti,ni,li,ri = hdr.index('type'),hdr.index('name'),hdr.index('label::English'),hdr.index('relevant')
    hits=[]
    for r in sv.iter_rows(min_row=2):
        v=[c.value for c in r]
        base=str(v[ti] or '').split()[0]
        if base in NOTE_TYPES: continue
        lab=str(v[li] or ''); rel=v[ri]
        if SKIP.search(lab) and not rel:
            hits.append((v[ni], lab[:95]))
    print(f'\n===== {label}: {len(hits)} inputs with skip-prose but NO relevant =====')
    for n,l in hits: print(f'  {n:20s} {l}')
    return hits

audit('CIPRB_Baseline_Hijra.xlsx','HIJRA')
audit('CIPRB_Baseline_FSW.xlsx','FSW')
