#!/usr/bin/env python3
"""
拉取 Praktika(AI 口语 App)上课记录,合并进 data/praktika-history.json。

接口是 app.praktika.ai 网页版用的非官方接口(路径带版本号 v16,随时可能变):
  1. 凭证链:Firebase refresh token(环境变量 PRAKTIKA_REFRESH_TOKEN,存 GitHub Secrets,长期有效)
     → securetoken 换 id_token(1h)→ /api/v16/tokens 换 Praktika JWT(3h)
  2. /bff-service/v1/sessions:上课记录(每页最多 20 条,按完成时间倒序),
     状态 COMPLETED(完成)/ ABORTED(中途退出,也带 completedAt)/ NEW(还没开始)
  3. /api/v16/sessions/{id}:单节详情,createdAt → completedAt 即这节课的时长(列表里没有)
  4. /bff-service/v1/study-plans、/api/v16/daily-streaks、/api/v16/profile:学习计划、连续天数、等级

归日按北京时间(与多邻国管道一致),按课程开始时间归日,与运行环境无关。
只有 COMPLETED 计入课数/时长;ABORTED 只记次数。sessions 明细只保留近 RETAIN_DAYS 天,
更早的天只留 daily 汇总,文件不随时间膨胀(全部进前端 bundle)。

用法: PRAKTIKA_REFRESH_TOKEN=... python3 scripts/fetch-praktika.py
     本地 python.org 安装缺 CA 时加 PRAKTIKA_INSECURE=1(DUOLINGO_INSECURE=1 也认)
CI:  与多邻国同一个 workflow 跑。Secret 没配 → 警告并跳过(删 Secret 即停用);
     配了却拉取失败(token 失效 / 接口变了)→ exit 1 报红,不静默提交残缺数据。
"""
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

# Firebase web API key:网页版前端公开下发的值(不是凭证),有 referrer 限制,请求必须带 Referer。
# 失效时从 app.praktika.ai/_next/static/chunks/ 的懒加载 chunk 里 grep "AIza" 重新拿。
FIREBASE_KEY = "AIzaSyCqcF4wHRuNZz0DrrJwZgdmjsHUcl9La70"
TOKEN_API = f"https://securetoken.googleapis.com/v1/token?key={FIREBASE_KEY}"
BASE = "https://core-prod-fast.praktika.ai"
REFERER = "https://app.praktika.ai/"
PAGE = 20  # sessions 接口 limit 上限
RETAIN_DAYS = 30  # sessions 明细保留天数(页面只展示最近几节,daily 汇总全量保留)
RECENT_OVERLAP_DAYS = 2  # 增量拉取时往回多看几天,覆盖跨夜/接口延迟
OUT = Path(__file__).resolve().parent.parent / "data" / "praktika-history.json"
TZ = ZoneInfo("Asia/Shanghai")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


def ssl_ctx():
    if os.environ.get("PRAKTIKA_INSECURE") or os.environ.get("DUOLINGO_INSECURE"):
        return ssl._create_unverified_context()
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return None


def request_json(url, data=None, headers=None, method=None):
    h = {"User-Agent": UA, "Accept": "application/json", "Referer": REFERER}
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=20, context=ssl_ctx()) as r:
        return json.load(r)


def login(refresh_token: str) -> dict:
    """refresh token → Praktika API 请求头。"""
    form = urllib.parse.urlencode({"grant_type": "refresh_token", "refresh_token": refresh_token})
    id_token = request_json(
        TOKEN_API, form.encode(), {"Content-Type": "application/x-www-form-urlencoded"}
    )["id_token"]
    jwt = request_json(f"{BASE}/api/v16/tokens", b"", {"Authorization": f"Bearer {id_token}"}, "POST")[
        "token"
    ]
    return {"Authorization": f"Bearer {jwt}", "X-App-Version": "web-1.0.0"}


def parse_ts(s: str) -> datetime:
    """接口时间是 UTC ISO 串,带 Z 和 6 位微秒;3.9 的 fromisoformat 不认 Z。"""
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def day_key(s: str) -> str:
    return parse_ts(s).astimezone(TZ).date().isoformat()


def fetch_session_list(headers, stop_before: str = None) -> list:
    """按完成时间倒序翻页;stop_before(YYYY-MM-DD)给了就翻到早于这天为止,否则拉全量。"""
    items, offset = [], 0
    while True:
        q = f"offset={offset}&limit={PAGE}&sort=completed_started%2Bdesc"
        page = request_json(f"{BASE}/bff-service/v1/sessions?{q}", headers=headers)
        batch = page.get("data") or []
        items.extend(batch)
        offset += len(batch)
        done_dates = [day_key(x["completedAt"]) for x in batch if x.get("completedAt")]
        if len(batch) < PAGE or offset >= (page.get("totalRecordCount") or 0):
            break
        if stop_before and done_dates and min(done_dates) < stop_before:
            break
    return items


def lesson_words(lesson: dict) -> list:
    lexis = (lesson.get("contentMaterial") or {}).get("lexis") or []
    return [
        (w["content"].strip(), (w.get("translation") or "").strip())
        for w in lexis
        if (w.get("content") or "").strip()
    ]


def build_session(item: dict, detail: dict) -> dict:
    """列表条目 + 单节详情 → 存档行。按开始时间归日。"""
    start = parse_ts(detail["createdAt"])
    end = parse_ts(detail["completedAt"])
    local = start.astimezone(TZ)
    lesson = item.get("lesson") or {}
    return {
        "id": item["sessionId"],
        "date": local.date().isoformat(),
        "start": local.strftime("%H:%M"),
        "seconds": max(0, round((end - start).total_seconds())),
        "caption": lesson.get("caption") or "",
        "lessonId": lesson.get("id"),
    }


def plan_units(raw: dict) -> list:
    """study-plans → [{name, units:[{name, lessons, state}]}],state = done / doing / todo。"""
    out = []
    for sp in raw.get("studyPlans") or []:
        for cat in sp.get("categories") or []:
            units = []
            for u in cat.get("units") or []:
                state = "done" if u.get("isFinished") else "doing" if u.get("isStarted") else "todo"
                units.append({"name": u.get("name") or "", "lessons": u.get("numLessons") or 0, "state": state})
            if units:
                out.append({"name": cat.get("name") or "", "units": units})
    return out


def merge(data: dict, fetched: list, aborted: dict, words: dict, current: dict, today: str) -> dict:
    """合并新拉到的完成课(fetched)进档案。

    - sessions 按 id 去重,新值覆盖;只留 today 往前 RETAIN_DAYS 天,按开始时间倒序
    - daily 由 sessions 重算,但只重算保留窗口内的天(更早的天明细已裁掉,重算会变残缺);
      窗口外、档案里没有的天(首次全量拉取)也照算
    - aborted 是本次拉取范围内每天的中途退出次数,同样只覆盖重算到的天
    - words 只增不改,记第一次遇到的日期
    """
    cutoff = (datetime.fromisoformat(today) - timedelta(days=RETAIN_DAYS - 1)).date().isoformat()
    by_id = {s["id"]: s for s in data.get("sessions") or []}
    for s in fetched:
        by_id[s["id"]] = s
    every = sorted(by_id.values(), key=lambda s: (s["date"], s["start"]), reverse=True)

    daily = dict(data.get("daily") or {})
    sums = {}
    for s in every:
        d = sums.setdefault(s["date"], {"lessons": 0, "seconds": 0})
        d["lessons"] += 1
        d["seconds"] += s["seconds"]
    for date, v in sums.items():
        if date >= cutoff or date not in daily:
            row = {"lessons": v["lessons"], "minutes": round(v["seconds"] / 60)}
            if aborted.get(date):
                row["aborted"] = aborted[date]
            elif daily.get(date, {}).get("aborted"):
                row["aborted"] = daily[date]["aborted"]
            daily[date] = row
    # 只有中途退出、没完成任何课的天:也记一行,lessons=0
    for date, n in aborted.items():
        if date not in sums and (date >= cutoff or date not in daily):
            daily[date] = {"lessons": 0, "minutes": 0, "aborted": n}

    known = dict(data.get("words") or {})
    for en, (zh, date) in words.items():
        if en not in known or date < known[en]["date"]:
            known[en] = {"zh": zh, "date": date}

    merged_current = dict(data.get("current") or {})
    merged_current.update({k: v for k, v in current.items() if v not in (None, [], "")})

    days_with_lessons = sorted(d for d, v in daily.items() if v.get("lessons"))
    return {
        "meta": {"since": days_with_lessons[0] if days_with_lessons else None},
        "current": merged_current,
        "daily": dict(sorted(daily.items())),
        "sessions": [s for s in every if s["date"] >= cutoff],
        "words": dict(sorted(known.items(), key=lambda kv: (kv[1]["date"], kv[0]))),
    }


def main():
    token = (os.environ.get("PRAKTIKA_REFRESH_TOKEN") or "").strip()
    if not token:
        if os.environ.get("CI"):
            # Secret 没配 = 用户停用了 Praktika 采集:不拖累多邻国快照,只在 Actions 页面留黄色警告
            print("::warning::PRAKTIKA_REFRESH_TOKEN not set, skipping Praktika fetch")
            return
        raise SystemExit("PRAKTIKA_REFRESH_TOKEN is not set")

    today = datetime.now(TZ).date().isoformat()
    data = json.loads(OUT.read_text()) if OUT.exists() else {}
    known_ids = {s["id"] for s in data.get("sessions") or []}
    stop_before = None
    if data.get("sessions"):
        latest = max(s["date"] for s in data["sessions"])
        stop_before = (datetime.fromisoformat(latest) - timedelta(days=RECENT_OVERLAP_DAYS)).date().isoformat()

    headers = login(token)
    items = fetch_session_list(headers, stop_before)

    fetched, aborted, words = [], {}, {}
    old = {s["id"]: s for s in data.get("sessions") or []}
    for it in items:
        status = it.get("status")
        if status == "ABORTED" and it.get("completedAt"):
            d = day_key(it["completedAt"])
            aborted[d] = aborted.get(d, 0) + 1
        if status != "COMPLETED" or not it.get("completedAt"):
            continue
        if it["sessionId"] in known_ids:
            s = old[it["sessionId"]]
        else:
            detail = request_json(f"{BASE}/api/v16/sessions/{it['sessionId']}", headers=headers)
            s = build_session(it, detail)
        fetched.append(s)
        for en, zh in lesson_words(it.get("lesson") or {}):
            if en not in words or s["date"] < words[en][1]:
                words[en] = (zh, s["date"])
    # 增量拉取时最老那天可能只拉到一部分:不覆盖它的 aborted 次数
    if stop_before:
        aborted = {d: n for d, n in aborted.items() if d > stop_before}

    streak = request_json(f"{BASE}/api/v16/daily-streaks", headers=headers)
    profile = request_json(f"{BASE}/api/v16/profile?lang=en", headers=headers)
    plans = request_json(f"{BASE}/bff-service/v1/study-plans", headers=headers)
    goal = profile.get("dailyGoal")
    current = {
        "streak": streak.get("streakLength"),
        "streakEnd": streak.get("streakEnd"),
        "longestStreak": streak.get("longestStreakDays"),
        "level": profile.get("cefrLevelExtended"),
        "dailyGoal": int(goal) if str(goal or "").isdigit() else None,
        "plan": plan_units(plans),
    }

    out = merge(data, fetched, aborted, words, current, today)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    for d in list(out["daily"])[-3:]:
        v = out["daily"][d]
        print(f"  {d}: {v['lessons']} lessons {v['minutes']}min" + (f" ({v['aborted']} aborted)" if v.get("aborted") else ""))
    print(
        f"Saved Praktika: {len(items)} fetched, {len(out['sessions'])} sessions kept, "
        f"{len(out['words'])} words, streak={current['streak']} -> {OUT}"
    )


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        print(f"praktika fetch failed: {e}", file=sys.stderr)
        sys.exit(1)
