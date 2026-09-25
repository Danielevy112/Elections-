
"""Curated, reproducible key-vote selection from Knesset OData and party platform headings.

Only exact-topic platform statements with an unambiguous bill title can carry a
mechanical mismatch label. New examples must be checked here; no free-text inference.
"""
import json, time, urllib.request
from pathlib import Path
B='https://knesset.gov.il/OdataV4/ParliamentInfo'
TOPICS=[
 {'party':'k26-11','category':'ועדת חקירה ממלכתית ל-7 באוקטובר','position':'הקמת ועדת חקירה ממלכתית','platform':'https://beytenu.org.il/party-platform/','vote':41283,'title':'ועדת חקירה ממלכתית','direction':'בעד'},
 {'party':'k26-11','category':'דת ומדינה - תחבורה ציבורית בשבת','position':'הפעלת תחבורה ציבורית בשבת','platform':'https://beytenu.org.il/party-platform/','vote':44753,'title':'הפעלת תחבורה ציבורית בשבת','direction':'בעד'},
 {'party':'k26-11','category':'לימודי ליבה חובה','position':'חובת לימודי ליבה','platform':'https://beytenu.org.il/party-platform/','vote':39288,'title':'חובת לימודי ליבה','direction':'בעד'},
 {'party':'k26-01','category':'חינוך - לימודי ליבה','position':'100% לימודי ליבה בתנאי תקצוב ציבורי','platform':'https://be-yahad.org.il/plans/education/','vote':31416,'title':'חובת לימודי ליבה','direction':'בעד'},
]

def get(url):
 for i in range(4):
  try:
   with urllib.request.urlopen(url,timeout=30) as r:return json.load(r)
  except Exception:
   if i==3:raise
   time.sleep(3*(i+1))

def rows(url):
 out=[]
 while url:
  d=get(url);out.extend(d['value']);url=d.get('@odata.nextLink')
 return out

def stage(option):
 if 'בקריאה שלישית' in option:return 'קריאה שלישית'
 if 'להכנה לקריאה שניה ושלישית' in option or 'להכנה לקריאה שנייה ושלישית' in option:return 'קריאה ראשונה'
 if 'להכנה לקריאה ראשונה' in option:return 'קריאה טרומית'
 return None

def main(root):
 root=Path(root)
 profiles=json.loads((root/'data/manual_overrides/knesset_profiles.json').read_text())['profiles']
 lists=json.loads((root/'data/manual_overrides/lists.json').read_text());lists=lists if isinstance(lists,list) else lists['lists']
 people={x['partyKey']:[{'name':c['nameHe'],'pid':profiles[c['nameHe']]['knessetPersonId']} for c in x['candidates'] if c['nameHe'] in profiles] for x in lists}
 result=[]
 for topic in TOPICS:
  v=get(f'{B}/KNS_PlenumVote({topic["vote"]})')
  if topic['title'] not in v['VoteTitle']:raise ValueError(f'title mismatch: {topic["vote"]} {v["VoteTitle"]}')
  st=stage(v.get('ForOptionDesc') or '')
  if not st:raise ValueError(f'unknown reading stage {topic["vote"]}')
  rs=rows(f'{B}/KNS_PlenumVoteResult?$filter=VoteID%20eq%20{topic["vote"]}')
  counts={z:sum(r.get('ResultDesc')==z for r in rs) for z in ('בעד','נגד')}
  dramatic=abs(counts['בעד']-counts['נגד'])<=10 or st=='קריאה שלישית' or 'חוק-יסוד' in v['VoteTitle']
  if not dramatic: continue
  ids={r['MkId']:r for r in rs}
  if len(ids)!=len(rs):raise ValueError(f'duplicate MK vote rows for vote {topic["vote"]}')
  for person in people[topic['party']]:
   r=ids.get(person['pid'])
   if not r or r.get('ResultDesc') not in ('בעד','נגד'):continue
   pos=rows(f'{B}/KNS_PersonToPosition?$filter=PersonID%20eq%20{person["pid"]}%20and%20PositionID%20eq%2054%20and%20KnessetNum%20ge%2020')
   when=v['VoteDateTime'][:10]
   factions={p['FactionName'].strip() for p in pos if p.get('FactionName') and p['StartDate'][:10]<=when and (not p.get('FinishDate') or when<p['FinishDate'][:10])}
   if len(factions)!=1:raise ValueError(f'ambiguous faction for {person["name"]}, {when}: {factions}')
   result.append({**topic,'candidate':person['name'],'mkId':person['pid'],'voteTitle':v['VoteTitle'],'date':when,'reading':st,'faction':next(iter(factions)),'positionAtVote':r['ResultDesc'],'for':counts['בעד'],'against':counts['נגד'],'mismatch':r['ResultDesc']!=topic['direction'],'factionUrl':f'{B}/KNS_PersonToPosition?$filter=PersonID%20eq%20{person["pid"]}%20and%20PositionID%20eq%2054%20and%20KnessetNum%20ge%2020','voteUrl':f'{B}/KNS_PlenumVote({topic["vote"]})','resultUrl':f'{B}/KNS_PlenumVoteResult?$filter=VoteID%20eq%20{topic["vote"]}%20and%20MkId%20eq%20{person["pid"]}'})
  print(topic['vote'],counts,st,'candidate votes',sum(x['vote']==topic['vote'] for x in result),flush=True)
 out={'source':B,'rubric':'פער עד 10, או קריאה שלישית, או חוק יסוד','votes':result,'partyPlatforms':{t['party']:t['platform'] for t in TOPICS}}
 (root/'data/manual_overrides/dramatic_votes.json').write_text(json.dumps(out,ensure_ascii=False,indent=1))
if __name__=='__main__':main('.')
