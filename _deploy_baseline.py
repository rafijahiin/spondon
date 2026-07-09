# -*- coding: utf-8 -*-
"""
Deploy the two D5 baseline XLSForms to KoboToolbox — idempotent.

Run on Railway so the prod env (KOBO_API_TOKEN, KOBO_WEBHOOK_SECRET) is injected:
    railway run python _deploy_baseline.py

Per form it: finds the asset by id_string (creates ONCE if absent — never a
duplicate), imports the built XLSX, deploys, attaches respondents_<pop>.csv as
form_media (the pulldata dedup source), and wires the submission webhook to
<APP>/webhook/kobo/ with the Authorization: Token <KOBO_WEBHOOK_SECRET> header.
Prints the asset UID + Enketo offline URL for each — RECORD THESE (they go into
submissions/views.py asset_uid_map, a KoboFormMapping migration, and Spine.tsx).

Build the forms + CSVs first:
    python manage.py build_baseline_forms
    python manage.py export_baseline_respondents
"""
import json
import os
import sys
import time

import requests

sys.stdout.reconfigure(encoding='utf-8')

TOK = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
SECRET = (os.environ.get('KOBO_WEBHOOK_SECRET') or '').strip()
BASE = (os.environ.get('KOBO_WEBHOOK_BASE')
        or 'https://web-production-091fa.up.railway.app').rstrip('/')
WEBHOOK = BASE + '/webhook/kobo/'
API = (os.environ.get('KOBO_API_BASE') or 'https://kf.kobotoolbox.org/api/v2').rstrip('/')
H = {'Authorization': f'Token {TOK}'}

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.normpath(os.path.join(HERE, '..', 'koboforms_baseline'))

FORMS = [
    dict(id='ciprb_baseline_hijra_v1', xlsx='CIPRB_Baseline_Hijra.xlsx',
         csv='respondents_hijra.csv',
         title='Baseline Survey — Hijra / Gender-diverse Population (CIPRB)'),
    dict(id='ciprb_baseline_fsw_v1', xlsx='CIPRB_Baseline_FSW.xlsx',
         csv='respondents_fsw.csv',
         title='Baseline Survey — Female Sex Workers (Brothel & Street) (CIPRB)'),
]


def find_or_create(form_id, title):
    q = requests.get(f'{API}/assets/?q=settings__id_string:"{form_id}"&format=json',
                     headers=H, timeout=60).json()
    hits = [a for a in q.get('results', [])
            if (a.get('settings') or {}).get('id_string') == form_id]
    if len(hits) > 1:
        print(f'  !! {len(hits)} assets already share id_string {form_id} — '
              'ABORTING to avoid a duplicate. Resolve in Kobo first.')
        return None
    if hits:
        print(f'  found existing asset {hits[0]["uid"]}')
        return hits[0]['uid']
    r = requests.post(f'{API}/assets/', headers=H, timeout=60, json={
        'name': title, 'asset_type': 'survey',
        'settings': {'id_string': form_id},
    })
    if r.status_code not in (200, 201):
        print('  !! create failed', r.status_code, r.text[:200]); return None
    uid = r.json()['uid']
    print(f'  created asset {uid}')
    return uid


def import_xlsx(uid, path):
    asset_url = f'{API}/assets/{uid}/'
    with open(path, 'rb') as f:
        files = {'file': (os.path.basename(path), f,
                 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        r = requests.post(f'{API}/imports/', headers=H, files=files,
                          data={'destination': asset_url, 'assetUid': uid}, timeout=120)
    imp = r.json().get('url')
    for _ in range(45):
        s = requests.get(imp + '?format=json', headers=H, timeout=60).json()
        if s.get('status') == 'complete':
            print('  import complete'); return True
        if s.get('status') == 'error':
            print('  !! import error', s.get('messages')); return False
        time.sleep(2)
    print('  !! import timed out'); return False


def deploy(uid):
    asset_url = f'{API}/assets/{uid}/'
    a = requests.get(asset_url + '?format=json', headers=H, timeout=90).json()
    vid = a.get('version_id')
    method = requests.patch if a.get('has_deployment') else requests.post
    r = method(asset_url + 'deployment/', headers=H,
               data={'active': 'true', 'version_id': vid}, timeout=120)
    print('  deploy', r.status_code)
    a3 = requests.get(asset_url + '?format=json', headers=H, timeout=90).json()
    links = a3.get('deployment__links') or {}
    return links.get('offline_url') or links.get('url') or '(no enketo link)'


def upload_media(uid, csv_path, csv_name):
    ex = requests.get(f'{API}/assets/{uid}/files/?format=json', headers=H, timeout=30)
    if ex.status_code == 200:
        for f in ex.json().get('results', []):
            meta = f.get('metadata', {}) or {}
            if f.get('description') == csv_name or meta.get('filename') == csv_name:
                requests.delete(f'{API}/assets/{uid}/files/{f["uid"]}/', headers=H, timeout=30)
    with open(csv_path, 'rb') as fh:
        files = {'content': (csv_name, fh.read(), 'text/csv')}
    data = {'file_type': 'form_media', 'description': csv_name,
            'metadata': json.dumps({'filename': csv_name})}
    r = requests.post(f'{API}/assets/{uid}/files/', headers=H, files=files, data=data, timeout=60)
    print('  media', r.status_code if r.status_code in (200, 201) else (r.status_code, r.text[:160]))


def wire_webhook(uid):
    ex = requests.get(f'{API}/assets/{uid}/hooks/?format=json', headers=H, timeout=30)
    if ex.status_code == 200:
        for h in ex.json().get('results', []):
            if h.get('endpoint') == WEBHOOK:
                requests.delete(f'{API}/assets/{uid}/hooks/{h["uid"]}/', headers=H, timeout=30)
    r = requests.post(f'{API}/assets/{uid}/hooks/', headers=H, timeout=30, json={
        'name': 'SIMPLE baseline', 'endpoint': WEBHOOK, 'active': True,
        'export_type': 'json', 'email_notification': False,
        'settings': {'custom_headers': {'Authorization': f'Token {SECRET}'}},
    })
    print('  webhook', r.status_code if r.status_code in (200, 201) else (r.status_code, r.text[:160]))


def allow_anon(uid):
    """Grant AnonymousUser view + submit so the Enketo link opens WITHOUT login
    (preview + field collection). Without this the /x/ link prompts for a Kobo
    account — which is wrong for a public field form."""
    anon = f'{API}/users/AnonymousUser/'
    for perm in ('view_asset', 'add_submissions'):
        requests.post(f'{API}/assets/{uid}/permission-assignments/', headers=H,
                      json={'user': anon, 'permission': f'{API}/permissions/{perm}/'},
                      timeout=30)
    print('  anon access enabled (login-less)')


def main():
    if not TOK:
        print('KOBO_API_TOKEN not set — run via: railway run python _deploy_baseline.py'); sys.exit(1)
    if not SECRET:
        print('!! KOBO_WEBHOOK_SECRET not set — webhook auth would be empty. Aborting.'); sys.exit(1)
    print(f'Kobo API: {API}\nWebhook : {WEBHOOK}\n')
    # Optional filter: `... _deploy_baseline.py hijra` redeploys only that form
    # (avoids re-importing the unchanged form when only one was edited).
    only = sys.argv[1].strip().lower() if len(sys.argv) > 1 else None
    results = []
    for f in FORMS:
        if only and only not in f['id'].lower():
            print(f"== {f['id']} == (skipped)")
            continue
        print(f"== {f['id']} ==")
        uid = find_or_create(f['id'], f['title'])
        if not uid:
            continue
        if not import_xlsx(uid, os.path.join(OUTDIR, f['xlsx'])):
            continue
        enketo = deploy(uid)
        upload_media(uid, os.path.join(OUTDIR, f['csv']), f['csv'])
        wire_webhook(uid)
        allow_anon(uid)
        results.append((f['id'], uid, enketo))
        print()
    print('\n================  RECORD THESE  ================')
    for fid, uid, enketo in results:
        print(f'{fid}\n  UID    : {uid}\n  Enketo : {enketo}\n')


if __name__ == '__main__':
    main()
