"""Refresh the complete ATT&CK catalogue from MITRE's versioned STIX 2.1 release."""
import json,urllib.request,hashlib,pathlib,datetime,concurrent.futures
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE='https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/'
def fetch(url):
 with urllib.request.urlopen(url,timeout=90) as r:return r.read()
def build(c):
 version=c['versions'][0];raw=fetch(version['url']);objects=json.loads(raw)['objects'];by_id={o['id']:o for o in objects}
 domain={'Enterprise ATT&CK':'enterprise','Mobile ATT&CK':'mobile','ICS ATT&CK':'ics'}[c['name']]
 def ref(o):return next((r for r in o.get('external_references',[]) if r.get('source_name') in ['mitre-attack','mitre-mobile-attack','mitre-ics-attack'] and 'external_id' in r),{})
 tactics=[]
 for m in objects:
  if m['type']=='x-mitre-matrix' and not m.get('revoked'):
   for tid in m['tactic_refs']:
    t=by_id[tid]
    if t['x_mitre_shortname'] not in [v['slug'] for v in tactics]:tactics.append({'id':ref(t).get('external_id',''),'slug':t['x_mitre_shortname'],'name':t['name']})
 parents={r['source_ref']:ref(by_id[r['target_ref']]).get('external_id') for r in objects if r['type']=='relationship' and r.get('relationship_type')=='subtechnique-of' and r.get('target_ref') in by_id}
 techniques=[]
 for o in objects:
  if o['type']!='attack-pattern':continue
  r=ref(o)
  if not r.get('external_id'):raise ValueError('Technique missing ATT&CK ID')
  techniques.append({'id':r['external_id'],'stixId':o['id'],'name':o['name'],'description':o.get('description',''),'url':r.get('url',''),'tactics':[p['phase_name'] for p in o.get('kill_chain_phases',[]) if p['kill_chain_name'] in ['mitre-attack','mitre-mobile-attack','mitre-ics-attack']], 'platforms':o.get('x_mitre_platforms',[]),'parentId':parents.get(o['id']),'revoked':o.get('revoked',False),'deprecated':o.get('x_mitre_deprecated',False),'modified':o.get('modified',''),'objectVersion':o.get('x_mitre_version','')})
 techniques.sort(key=lambda t:t['id'])
 out={'domain':domain,'name':c['name'],'version':version['version'],'source':version['url'],'sourceSha256':hashlib.sha256(raw).hexdigest(),'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tactics':tactics,'techniques':techniques}
 (ROOT/'public'/'attack'/f'{domain}.json').write_text(json.dumps(out,separators=(',',':')))
 print(domain,'release',version['version'],'tactics',len(tactics),'techniques including retired',len(techniques),'active',sum(not t['revoked'] and not t['deprecated'] for t in techniques),flush=True)
 index={domain+':'+t['id']:{k:t[k] for k in ['id','name','stixId','tactics','revoked','deprecated']}|{'domain':domain,'version':version['version'],'tacticNames':[v['name'] for v in tactics if v['slug'] in t['tactics']]} for t in techniques}
 return index
if __name__=='__main__':
 catalog=json.loads(fetch(BASE+'index.json'));index={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for data in pool.map(build,catalog['collections']):index.update(data)
 existing=json.loads((ROOT/'lib'/'attack-index.json').read_text())
 index.update({key:value for key,value in existing.items() if key.startswith('atlas:')})
 (ROOT/'lib'/'attack-index.json').write_text(json.dumps(index,separators=(',',':')))
 (ROOT/'public'/'attack'/'LICENSE.txt').write_bytes(fetch(BASE+'LICENSE.txt'))
