"""Fetch bounded open provincial inputs; raw cache stays outside Git. Run before buildPokerData.mjs."""
import argparse
import json,urllib.request,urllib.parse,time,pathlib,hashlib,concurrent.futures
parser=argparse.ArgumentParser()
parser.add_argument('--cache',default='/tmp/poker-sources')
args=parser.parse_args()
cache=pathlib.Path(args.cache);cache.mkdir(exist_ok=True)
bounds=[-61.57,45.77,-61.24,46.19]
w,s,e,n=bounds
polygon=f'POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))'
datasets={'civic':('tntn-er5g','pntid','the_geom,pntid,civicnum,civsuffix,unit_num,add_loc,strprefix,strname,strsuffix,strdir,comm,mun,county'), 'roads':('484g-adjn','roadsegid','the_geom,roadsegid,street,feat_desc,roadc_desc'), 'buildings':('n7be-bzwb',':id',':id as source_row_id,the_geom,feat_code,feat_desc'), 'footprints':('t5xr-fjkr',':id',':id as source_row_id,the_geom,feat_code,feat_desc'), 'water':('h8jb-hzrm',':id',':id as source_row_id,the_geom,feat_code,feat_desc')}
def get(url):
 for i in range(3):
  try:
   with urllib.request.urlopen(url,timeout=90) as r:return json.load(r)
  except Exception:
   if i==2:raise
   time.sleep(2)
def fetch(item):
 name,(dataset,order,fields)=item;path=cache/(name+'.json')
 if path.exists():return name,len(json.load(open(path))['features'])
 metadata=get(f'https://data.novascotia.ca/api/views/{dataset}.json')
 assert metadata['licenseId']=='OGL_NOVA_SCOTIA',metadata.get('licenseId')
 features=[];urls=[]
 for offset in range(0,100000,1000):
  params={'$select':fields,'$where':f"intersects(the_geom, '{polygon}')",'$order':order,'$limit':'1000','$offset':str(offset)}
  url='https://data.novascotia.ca/resource/'+dataset+'.geojson?'+urllib.parse.urlencode(params);urls.append(url)
  d=get(url);assert d['type']=='FeatureCollection'
  features.extend(d['features'])
  if len(d['features'])<1000:break
 else:raise Exception('Unbounded result')
 path.write_text(json.dumps({'type':'FeatureCollection','features':features},separators=(',',':')))
 (cache/(name+'-receipt.json')).write_text(json.dumps({'dataset':dataset,'url':f'https://data.novascotia.ca/d/{dataset}','queries':urls,'count':len(features),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'dataUpdatedAt':metadata.get('rowsUpdatedAt'),'fetchedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'bounds':bounds}))
 return name,len(features)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for r in pool.map(fetch,datasets.items()):print(r,flush=True)
