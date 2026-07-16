import django, os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.environ.setdefault('DJANGO_SETTINGS_MODULE','spondon.settings'); django.setup()
from baseline.models import BaselineResponse
from baseline.srhr import compute_srhr
out = compute_srhr(BaselineResponse.objects.all())
for pop, d in out.items():
    print(f'\n===== {pop}  n={d["n"]} =====')
    for m in d['modules']:
        print(f'  [{m["module"]}]')
        for i in m['indicators']:
            v = i.get('value'); nn = i.get('n')
            flag = ''
            if v is None: flag = '   <-- NULL (gap)'
            elif v == 0: flag = '   <-- ZERO'
            elif nn is not None and nn < 5: flag = f'   <-- thin n={nn}'
            print(f'      {str(v):>7} (n={nn:>3})  {i["label"][:42]:42s}{flag}')
