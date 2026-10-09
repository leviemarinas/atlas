import json

with open('scratch_brd_features.json', 'r', encoding='utf-8') as f:
    features = json.load(f)

hrm_features = [f for f in features if f['id'].startswith('HT') and int(f['id'][2:]) <= 210]

print(f"Total core HRM features (HT001-HT210): {len(hrm_features)}")

modules_map = {}
for f in hrm_features:
    m = f['module']
    if m not in modules_map:
        modules_map[m] = []
    modules_map[m].append(f)

for m, flist in modules_map.items():
    print(f"\n==================== {m} ({len(flist)} features) ====================")
    for f in flist:
        print(f"[{f['id']}] {f['feature']} (Actor: {f['actor']})")
        if f['desc']:
            print(f"   Desc: {f['desc']}")
        if f['add_desc']:
            print(f"   AddDesc: {f['add_desc']}")
