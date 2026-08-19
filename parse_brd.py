import openpyxl
import json
from collections import defaultdict

wb = openpyxl.load_workbook(r'C:\Users\josrp\Downloads\Atlas\BRD-Project Atlas PHASE 1 Features_HRIS and TK System - August 30, 2024.xlsx', data_only=True)
ws = wb['Phase 1 BRD']

rows = list(ws.iter_rows(values_only=True))
headers = rows[0]

features = []
for r in rows[1:]:
    if not r[0] or not r[3]:
        continue
    feat = {
        'id': r[0],
        'system': r[1],
        'phase': r[2],
        'module': str(r[3]).strip() if r[3] else '',
        'module_no': r[4],
        'submodule': str(r[5]).strip() if r[5] else '',
        'feature': str(r[6]).strip() if r[6] else '',
        'desc': str(r[7]).strip() if r[7] else '',
        'add_desc': str(r[8]).strip() if r[8] else '',
        'status': str(r[9]).strip() if r[9] else '',
        'type': str(r[10]).strip() if r[10] else '',
        'actor': str(r[14]).strip() if r[14] else '',
        'brd': str(r[18]).strip() if r[18] else '',
    }
    features.append(feat)

print(f'Total features in Phase 1 BRD: {len(features)}')

with open('scratch_brd_features.json', 'w', encoding='utf-8') as f:
    json.dump(features, f, indent=2)

# Group by Module
by_mod = defaultdict(list)
for f in features:
    by_mod[f['module']].append(f)

for m, flist in sorted(by_mod.items()):
    print(f'=== Module: {m} ({len(flist)} features) ===')
    for f in flist:
        print(f"  [{f['id']}] {f['feature']} | Actor: {f['actor']}")
        if f['desc']:
            print(f"      Desc: {f['desc'][:100]}")
        if f['add_desc']:
            print(f"      Add: {f['add_desc'][:100]}")
