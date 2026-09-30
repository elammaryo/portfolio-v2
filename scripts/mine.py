import subprocess, json, collections, os
repos = {"cosmic-portfolio":"elammaryo/cosmic-portfolio","ai-chatbot":"elammaryo/ai-chatbot","gameover":"elammaryo/gameover","gyo-self-order":"elammaryo/gyo-self-order","qr-generator":"elammaryo/qr-generator","athena":"athena","gameday":"gameday","budgeting-app":"budgeting-app","super-over":"super-over","super-over-backend":"super-over-backend","superover-green-grounds":"superover-green-grounds","admin-dashboard":"admin-dashboard"}
me = lambda n,e: 'elammaryo' in e or 'oa.elammary' in e or n=='Omer Elammary'
out={"commits":[], "repos":{}}
extmap={'.dart':'Dart','.ts':'TypeScript','.tsx':'TypeScript','.js':'JavaScript','.jsx':'JavaScript','.py':'Python','.css':'CSS','.scss':'CSS','.html':'HTML','.swift':'Swift','.kt':'Kotlin','.sql':'SQL','.go':'Go','.java':'Java','.vue':'Vue','.glsl':'GLSL'}
for name,path in repos.items():
    log = subprocess.run(['git','-C',path,'log','--all','--format=%H|%an|%ae|%aI|%s'],capture_output=True,text=True).stdout.strip().splitlines()
    seen=set(); mine=0; paired=0
    for l in log:
        h,an,ae,d,s = l.split('|',4)
        if h in seen: continue
        seen.add(h)
        body = subprocess.run(['git','-C',path,'show','-s','--format=%b',h],capture_output=True,text=True).stdout if False else ''
        if me(an,ae): mine+=1; out["commits"].append([name,d,s[:90]])
    langs=collections.Counter()
    files = subprocess.run(['git','-C',path,'ls-files'],capture_output=True,text=True).stdout.splitlines()
    for f in files:
        if any(x in f for x in ['node_modules','/build/','.lock','generated','.g.dart','dist/']): continue
        ext=os.path.splitext(f)[1]
        if ext in extmap:
            try: langs[extmap[ext]]+=sum(1 for _ in open(os.path.join(path,f),errors='ignore'))
            except: pass
    out["repos"][name]={"total":len(seen),"mine":mine,"langs":dict(langs.most_common(6)),"files":len(files)}
json.dump(out,open('/home/claude/site-data/raw.json','w'))
tot=sum(r['mine'] for r in out['repos'].values())
print("mine total",tot)
for k,v in out['repos'].items(): print(k,v)
