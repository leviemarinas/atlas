import openpyxl
import json
from collections import defaultdict

wb = openpyxl.load_workbook(r'C:\Users\josrp\Downloads\Atlas\BRD-Project Atlas PHASE 1 Features_HRIS and TK System - August 30, 2024.xlsx', data_only=True)
ws = wb['Phase 1 BRD']

rows = list(ws.iter_rows(values_only=True))

hrm_features = []
for r in rows[1:]:
    if not r[0] or not r[3]:
        continue
    feat_id = str(r[0]).strip()
    system = str(r[1] or '').strip()
    phase = str(r[2] or '').strip()
    module = str(r[3] or '').strip()
    submod = str(r[5] or '').strip()
    feature = str(r[6] or '').strip()
    desc = str(r[7] or '').strip()
    add_desc = str(r[8] or '').strip()
    actor = str(r[14] or '').strip()
    brd_yn = str(r[18] or '').strip()
    
    # Core HRM features in Phase 1 (HT001 - HT210)
    if feat_id.startswith('HT'):
        try:
            num = int(feat_id[2:])
            if 1 <= num <= 210 or (system and 'HRM' in system.upper()):
                hrm_features.append({
                    'id': feat_id,
                    'num': num,
                    'system': system,
                    'phase': phase,
                    'module': module,
                    'submodule': submod,
                    'feature': feature,
                    'desc': desc,
                    'add_desc': add_desc,
                    'actor': actor,
                    'brd': brd_yn
                })
        except ValueError:
            pass

print(f"Total Phase 1 HRM features identified: {len(hrm_features)}")

by_module = defaultdict(list)
for f in hrm_features:
    by_module[f['module']].append(f)

with open('hrm_brd_audit.json', 'w', encoding='utf-8') as out:
    json.dump(hrm_features, out, indent=2)

print("\n=== SUMMARY BY BRD MODULE ===")
for mod, flist in sorted(by_module.items()):
    print(f"[{mod}]: {len(flist)} features (IDs: {flist[0]['id']} - {flist[-1]['id']})")
