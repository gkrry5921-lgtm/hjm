"""GitHub Actions hourly KST reminders; requires Firebase service account secret."""
import json, os
from datetime import datetime, timedelta, timezone
import firebase_admin
from firebase_admin import credentials, firestore, messaging

KST=timezone(timedelta(hours=9))
now=datetime.now(KST)
today=now.date().isoformat()
tomorrow=(now.date()+timedelta(days=1)).isoformat()
cred=json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
firebase_admin.initialize_app(credentials.Certificate(cred))
db=firestore.client()

def messages_for(events, routines):
    result=[]
    for e in events:
        if e.get("done") is True: continue
        date=e.get("start") or e.get("date")
        if date in (today,tomorrow):
            label="오늘 일정" if date==today else "내일 일정"
            result.append((f"event:{e.get('id')}:{date}",f"📅 {label}",str(e.get("title") or "일정을 확인하세요")))
    for r in routines:
        if r.get("taskDone") or not r.get("due"): continue
        due=r["due"]
        if due in (today,tomorrow):
            label="오늘 마감" if due==today else "내일 마감"
            result.append((f"routine:{r.get('id')}:{due}",f"✅ {label}",str(r.get("title") or "업무를 확인하세요")))
    return result

def run():
    # cron: 매일 한국시간 오전 9시(UTC 0시). 실행 지연 가능.
    if now.hour!=9:
        print("KST hour is not 09; skipping",now.isoformat());return
    for u in db.collection("users").stream():
        base=db.collection("users").document(u.id)
        tokens=list(base.collection("hjm_push_tokens").where("enabled","==",True).stream())
        if not tokens: continue
        ev=[dict(x.to_dict(),id=x.id) for x in base.collection("hjm_events").stream()]
        rr=[dict(x.to_dict(),id=x.id) for x in base.collection("hjm_routines").stream()]
        alerts=messages_for(ev,rr)
        if not alerts: continue
        for t in tokens:
            token=t.to_dict().get("token")
            if not token:continue
            for key,title,body in alerts:
                # prevent duplicate sends on reruns. Single-day document key per device.
                sent_id=f"{today}-{t.id}-{key}".replace("/","_")
                marker=base.collection("hjm_push_sent").document(sent_id)
                if marker.get().exists:continue
                try:
                    messaging.send(messaging.Message(
                        token=token,notification=messaging.Notification(title=title,body=body),
                        webpush=messaging.WebpushConfig(
                            headers={"TTL":"86400"},
                            fcm_options=messaging.WebpushFCMOptions(link="https://gkrry5921-lgtm.github.io/hjm/"))
                    ))
                    marker.set({"sentAt":firestore.SERVER_TIMESTAMP,"key":key})
                    print("sent",u.id,key)
                except messaging.UnregisteredError:
                    t.reference.update({"enabled":False})
                    print("unregistered token",t.id)
                except Exception as e:
                    print("send failed",u.id,key,str(e))
if __name__=="__main__":run()
