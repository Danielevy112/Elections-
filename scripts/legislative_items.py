"""Fetch individual Knesset bill and query records for exact-linked candidate IDs.

The output is supplementary to knesset_activity.json: individual URLs and current
status labels, not a replacement for the time-windowed aggregate counts.
"""
import json, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
B = 'https://knesset.gov.il/OdataV4/ParliamentInfo'

def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=35) as r: return json.load(r)
        except Exception:
            if attempt == 3: raise
            time.sleep((attempt+1)*3)

def rows(path):
    url, out = f'{B}/{path}', []
    while url:
        obj=get(url.replace(' ','%20')); out.extend(obj['value']); url=obj.get('@odata.nextLink')
    return out

def one(pair):
    name,pid=pair
    b=rows(f'KNS_BillInitiator?$filter=PersonID eq {pid} and IsInitiator eq true&$select=BillID&$expand=KNS_Bill($select=Id,Name,KnessetNum,StatusID)')
    bills=[]
    for r in b:
        v=r.get('KNS_Bill') or {}
        if 20 <= v.get('KnessetNum',0) <= 25:
            bills.append({'id':r['BillID'],'title':v['Name'],'knesset':v['KnessetNum'],'statusId':v['StatusID'],'url':f'{B}/KNS_Bill({r["BillID"]})'})
    q=rows(f'KNS_Query?$filter=PersonID eq {pid}&$select=Id,Name,KnessetNum,StatusID,SubmitDate')
    queries=[{'id':v['Id'],'title':v['Name'],'knesset':v['KnessetNum'],'statusId':v['StatusID'],'submitted':v.get('SubmitDate'),'url':f'{B}/KNS_Query({v["Id"]})'} for v in q if 20<=v.get('KnessetNum',0)<=25]
    return name,{'bills':sorted(bills,key=lambda x:x['id'], reverse=True),'questions':sorted(queries,key=lambda x:x['id'], reverse=True)}

def main(root):
    root=Path(root)
    profiles=json.loads((root/'data/manual_overrides/knesset_profiles.json').read_text())['profiles']
    people={n:p['knessetPersonId'] for n,p in profiles.items() if set(p['knessetTerms'])&set(range(20,26))}
    path=root/'.cache/legislative_items.partial.json'; path.parent.mkdir(exist_ok=True)
    out=json.loads(path.read_text()) if path.exists() else {}
    for name,pid in sorted(people.items()):
        if name in out:continue
        key,rec=one((name,pid));out[key]=rec
        path.write_text(json.dumps(out,ensure_ascii=False))
        print(name,len(rec['bills']),len(rec['questions']),file=sys.stderr,flush=True)
    status_ids=sorted({item['statusId'] for rec in out.values() for group in rec.values() for item in group})
    statuses={str(i):get(f'{B}/KNS_Status({i})')['Desc'] for i in status_ids}
    (root/'data/manual_overrides/legislative_items.json').write_text(json.dumps({'source':B,'statuses':statuses,'items':out},ensure_ascii=False,indent=1))
if __name__=='__main__': main(sys.argv[1] if len(sys.argv)>1 else '.')
