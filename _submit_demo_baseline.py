"""
Submit demo baseline data for Hijra and FSW forms via Kobo API.
Strategy: fetch existing submission as template, modify key fields, re-submit.
"""
import os, sys, json, requests, datetime, random, string
sys.stdout.reconfigure(encoding='utf-8')

tok = (os.environ.get('KOBO_API_TOKEN') or os.environ.get('KOBO_TOKEN') or '').strip()
if not tok:
    print('NO TOKEN'); sys.exit(1)

H = {'Authorization': f'Token {tok}', 'Content-Type': 'application/json'}
API = 'https://kf.kobotoolbox.org/api/v2'

FORMS = {
    'HIJRA': 'aBT7aCL9p4FGcW4WwXZcr6',
    'FSW':   'aVsJ7VJ35k8GshpQpnXygC',
}

for label, uid in FORMS.items():
    print(f'\n=== {label} (uid={uid}) ===')

    # Fetch existing submissions as template
    r = requests.get(f'{API}/assets/{uid}/submissions/?format=json&limit=2', headers=H, timeout=60)
    data = r.json()
    results = data.get('results', [])
    print(f'  Existing subs: {data.get("count", 0)}')

    if results:
        print('  Using existing submission as template')
        template = dict(results[0])
        # Remove Kobo-internal fields
        for k in ['_id', '_uuid', '_submission_time', '_submitted_by', '_version_',
                  '_xform_id_string', '_geolocation', '_attachments', '_notes',
                  '_validation_status', '_tags', '_status', '_submitted_by',
                  'meta/instanceID', 'formhub/uuid']:
            template.pop(k, None)

        # Update key identifiers to make it a new unique submission
        rnd = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
        today = datetime.date.today().isoformat()

        if label == 'HIJRA':
            template['questionnaire_serial'] = f'DEMO-H-{rnd}'
            template['interview_date'] = today
        else:
            template['questionnaire_serial'] = f'DEMO-F-{rnd}'
            template['interview_date'] = today

        # Submit
        submit_r = requests.post(
            f'{API}/assets/{uid}/submissions/',
            headers=H,
            json=template,
            timeout=60
        )
        print(f'  Submit status: {submit_r.status_code}')
        resp = submit_r.json()
        print(f'  Response: {json.dumps(resp, indent=2)[:500]}')
    else:
        print('  No existing submissions — need to build from scratch')
        # Build minimal submission from choices
        r2 = requests.get(f'{API}/assets/{uid}/?format=json', headers=H, timeout=90)
        asset = r2.json()
        choices = {}
        for c in asset.get('content', {}).get('choices', []):
            lst = c.get('list_name', '')
            if lst not in choices:
                choices[lst] = []
            choices[lst].append(c.get('name', ''))

        # Print available choice lists so we can build the submission
        print('  Choice lists:')
        for lst, vals in list(choices.items())[:10]:
            print(f'    {lst}: {vals[:5]}')
