import json, re, datetime, collections
raw=json.load(open('raw.json'))
order=["super-over","athena","gameover","super-over-backend","budgeting-app","cosmic-portfolio","superover-green-grounds","gameday","gyo-self-order","ai-chatbot","admin-dashboard","qr-generator"]
bad=re.compile(r'(secret|password|passwd|token|api[_ -]?key|\.env|credential|private key)',re.I)
commits=[]
hours=[0]*24; wd=[0]*7; days=collections.Counter()
for repo,d,s in raw["commits"]:
    dt=datetime.datetime.fromisoformat(d)
    hours[dt.hour]+=1; wd[dt.weekday()]+=1
    days[dt.date().isoformat()]+=1
    msg = s if not bad.search(s) else ""
    msg = re.sub(r'\s+',' ',msg).strip()
    commits.append([order.index(repo), int(dt.timestamp()), msg])
commits.sort(key=lambda c:c[1])
# Keep only the messages the page shows. The ticker (fillTicker in src/charts.ts) shows the
# latest 90 that say something (over 12 characters) and aren't merges; every other message
# is blanked here, so neither this file nor the site's bundle carries text nobody sees. Of the
# 2,034 messages it used to hold, about 1,100 came from SuperOver's private company repos.
# Keep TICKER and the rule in step with fillTicker.
TICKER=90
shown=[i for i,c in enumerate(commits) if len(c[2])>12 and not c[2].lower().startswith('merge')][-TICKER:]
keep=set(shown)
for i,c in enumerate(commits):
    if i not in keep: c[2]=""
repos=[{"id":r,**{k:raw["repos"][r][k] for k in ("mine","langs")}} for r in order]
langs=collections.Counter()
for r in raw["repos"].values():
    for k,v in r["langs"].items(): langs[k]+=v
# streak
ds=sorted(days)
best=cur=1
for a,b in zip(ds,ds[1:]):
    if (datetime.date.fromisoformat(b)-datetime.date.fromisoformat(a)).days==1: cur+=1; best=max(best,cur)
    else: cur=1
busiest=days.most_common(1)[0]
out={"repos":repos,"commits":commits,"hours":hours,"weekdays":wd,"days":days,"langs":dict(langs.most_common()),"stats":{"total":len(commits),"activeDays":len(days),"bestStreak":best,"busiest":busiest,"first":ds[0],"last":ds[-1],"lateNight":sum(hours[h] for h in [22,23,0,1,2,3,4])}}
json.dump(out,open('commits.json','w'),separators=(',',':'))
print(out["stats"], hours, wd, dict(langs.most_common()), sum(1 for c in commits if not c[2]))
