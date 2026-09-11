#!/usr/bin/env python3
"""
拉取多邻国学习数据,追加每日快照到 data/duolingo-history.json。

两级数据源:
  1. 公开接口(无登录):streak / 总XP / 课程 —— 永远可用,保底
  2. 带 JWT(环境变量 DUOLINGO_JWT,存于 GitHub Secrets):
     - xp_summaries 接口:按天给 XP / 课数(numSessions)/ 真实学习秒数(totalSessionTime),
       可回溯到开课第一天,是每日明细(daily)的正式来源(2026-09-11 起;之前用 xpGains 时间戳估时长)
     - 逐课 xpGains 记录(约 15 天滚动窗口):只用来反推"哪天完成哪个单元 / 哪天到哪一分"
       (unitDone / scoreReached),这两份日期由学习行为决定、与采集时刻无关

一天一条,同日重跑覆盖;快照行的"今天"在北京凌晨 5 点前算前一天(CI 定时漂移到凌晨时仍归前一晚)。
归日统一按北京时间(Asia/Shanghai),与多邻国 streak 口径一致,本地跑和 CI(UTC)结果相同。

用法: python3 scripts/fetch-duolingo.py
CI:  GitHub Actions 每日定时跑,自动 commit 数据文件。
"""
import json
import os
import ssl
import sys
import time
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

USERNAME = "Hello.Max"  # 2026-08 改名,原 Max__Zhang;USER_ID 不随改名变,无需动
USER_ID = "316697694210185"  # 登录接口按 id 查询,公开接口按 username
PUBLIC_API = f"https://www.duolingo.com/2017-06-30/users?username={USERNAME}"
AUTH_API = f"https://www.duolingo.com/2017-06-30/users/{USER_ID}"
SUMMARY_API = f"https://www.duolingo.com/2017-06-30/users/{USER_ID}/xp_summaries"
SUMMARY_DAYS = 45  # 每次回看多少天的 xp_summaries(合并只增不减,窗口只需覆盖可能被回填的近期)
OUT = Path(__file__).resolve().parent.parent / "data" / "duolingo-history.json"

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
TZ = ZoneInfo("Asia/Shanghai")  # 归日时区固定为北京时间,不随运行环境(本地/CI)漂移
# 快照行的"学习日"切换点:凌晨 5 点前跑的采集归前一天。
# GitHub 定时任务实测漂移 3~5 小时,"21:13 收尾"实际常在次日 0~2 点跑,
# 按自然日归会把前一晚学出来的进度记成次日(2026-09-11 排查 16→17 分升档日晚记一天时发现)
DAY_ROLLOVER_HOUR = 5


def ssl_ctx():
    """本地 python.org 安装可能缺 CA;优先 certifi,再退回不验证(仅本地脚本可接受)。"""
    if os.environ.get("DUOLINGO_INSECURE"):
        return ssl._create_unverified_context()
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return None


def get_json(url, auth=None):
    headers = {"User-Agent": UA, "Accept": "application/json"}
    if auth:
        headers["Authorization"] = f"Bearer {auth}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20, context=ssl_ctx()) as r:
        return json.load(r)


def fetch_course_progress(u):
    """从带 JWT 的完整档案提取课程进度:各 CEFR 段的单元完成情况 + 该段覆盖的分数区间。

    scoreMin/scoreMax 来自段内单元的 unit_score(实测 Intro 5~9、A1 10~29、A2 30~59、
    B1 60~99、B2 100~128),页面用它画"当前段分数区间"的走势图和"下一段起始分"。
    同一 CEFR 名可能拆成多段(A1 就是两段),页面按名合并。
    """
    sections = []
    for sec in ((u.get("currentCourse") or {}).get("pathSectioned") or []):
        units = sec.get("units", [])
        if not units:
            continue
        row = {
            "cefr": units[0].get("cefrLevel"),
            "unitsTotal": len(units),
            "unitsCompleted": sec.get("completedUnits") or 0,
        }
        scores = [unit_score(x) for x in units]
        scores = [x for x in scores if x is not None]
        if scores:
            row["scoreMin"] = min(scores)
            row["scoreMax"] = max(scores)
        sections.append(row)
    return sections


def extract_score_info(current_course):
    """多邻国分数(10~160,CEFR 对齐,随课程进度/关卡测量浮动)及预估下一分所需信息。

    返回字段去向:reached/lastUnitDone/nextAtUnit 进当天的 days 行 score 键,
    max(课程满分)进 current.scoreMax:
    - reached:当前分数(scoreMetadata.reachedScore,接口原值,无计算)
    - lastUnitDone:最后已完成单元的全局 unitIndex。路径线性解锁,
      每段完成的必是前 N 个单元,取第 N 个的 unitIndex
    - bandStart:当前分数带的首单元(全局 unitIndex),页面用 (lastUnitDone-bandStart+1)/(nextAtUnit-bandStart+1)
      画"本档进度条"(Duolingo 自家 UI 就是当前分→下一分的进度条)
    - nextAtUnit:"完成它就到下一分"的单元(全局 unitIndex)。
      节点级 levelScoreInfo.reachedScore = 学这个单元时持有的分数,一个单元内所有节点相同,
      分数只在单元切换时跳变——所以要取当前分数带的最后一个单元,
      不是下一分带的最后一个(2026-09-11 前取错成后者,预估整体多出一整个带)。
      页面结合推进速度算"还差几个单元、大概哪天到下一分"
    接口偶发缺这些字段时返回空 dict:当天行没 score 键,页面用最近一份兜底。
    分数是快变量,刻意不沿用旧值,宁可缺一天也不留过期值。
    """
    cc = current_course or {}
    meta = cc.get("scoreMetadata") or {}
    score = meta.get("reachedScore")
    if not score:
        return {}
    info = {"reached": score}
    if meta.get("pathEndingScore"):
        info["max"] = meta["pathEndingScore"]
    for sec in cc.get("pathSectioned") or []:
        units = sec.get("units") or []
        n = min(sec.get("completedUnits") or 0, len(units))
        if n > 0 and units[n - 1].get("unitIndex") is not None:
            info["lastUnitDone"] = max(info.get("lastUnitDone", 0), units[n - 1]["unitIndex"])
        if info.get("max") is not None and score >= info["max"]:
            continue  # 已满分:再没有"做完就涨分"的单元
        for unit in units:
            idx = unit.get("unitIndex")
            if idx is not None and unit_score(unit) == score:
                info["nextAtUnit"] = max(info.get("nextAtUnit", 0), idx)
                info["bandStart"] = min(info.get("bandStart", idx), idx)
    return info


def unit_score(unit):
    """学这个单元时持有的分数(节点 levelScoreInfo.reachedScore,单元内一致,取最小值防脏数据)。"""
    scores = [
        (lv.get("levelScoreInfo") or {}).get("reachedScore") for lv in unit.get("levels") or []
    ]
    scores = [x for x in scores if x is not None]
    return min(scores) if scores else None


def extract_unit_progress(current_course, gains):
    """从逐课记录反推"哪天完成了哪个单元 / 哪天到了哪一分",与采集时刻无关。

    分数只在单元切换时跳变:完成 unit N 的那一刻,分数变成 unit N+1 的 unit_score。
    单元完成时刻夹在"本单元最后一节课"和"下一单元第一节课"之间(中间是单元复习/故事等
    不带 skillId 的节点),取这个区间里最后一次得分记录的时间归日。
    xpGains 只有约 15 天窗口:本单元最后一课已滑出窗口的不算(区间下界不可知,不能拿
    窗口里随便一次练习冒充完成时刻),靠每次采集合并积累,已有的不覆盖。

    返回 (unitDone, scoreReached),键都是字符串(与 JSON 读回来的形态一致,便于合并):
      unitDone     {"30": "2026-09-08"}   完成单元 30 的日期
      scoreReached {"17": "2026-09-08"}   到达 17 分的日期
    """
    cc = current_course or {}
    skill_units = {}
    scores = {}
    for sec in cc.get("pathSectioned") or []:
        for unit in sec.get("units") or []:
            idx = unit.get("unitIndex")
            if idx is None:
                continue
            sc = unit_score(unit)
            if sc is not None:
                scores[idx] = sc
            for lv in unit.get("levels") or []:
                sid = (lv.get("pathLevelMetadata") or {}).get("skillId")
                if sid:
                    skill_units.setdefault(sid, set()).add(idx)
    # 后段课程一个 skillId 横跨多个单元(实测从 unit 130 起),对不上具体单元的不用
    skill_unit = {sid: next(iter(us)) for sid, us in skill_units.items() if len(us) == 1}

    times = sorted(g["time"] for g in gains or [] if g.get("time") is not None)
    first = {}
    last = {}
    for g in sorted(gains or [], key=lambda g: g.get("time") or 0):
        idx = skill_unit.get(g.get("skillId"))
        if idx is None or g.get("time") is None:
            continue
        first.setdefault(idx, g["time"])
        last[idx] = g["time"]

    unit_done = {}
    score_reached = {}
    for idx in sorted(first):
        prev = idx - 1
        if prev not in last or last[prev] >= first[idx]:
            continue
        between = [t for t in times if last[prev] <= t < first[idx]]
        done_day = day_key(between[-1])
        unit_done[str(prev)] = done_day
        if prev in scores and idx in scores and scores[idx] > scores[prev]:
            score_reached[str(scores[idx])] = done_day
    return unit_done, score_reached


def fetch_public():
    """公开主页数据:保底层,永远跑。"""
    u = get_json(PUBLIC_API).get("users", [])
    if not u:
        raise SystemExit(f"User {USERNAME} not found (profile may be private)")
    u = u[0]
    return {
        "username": u.get("username"),
        "totalXp": u.get("totalXp"),
        "streak": u.get("streak"),
        "streakStart": (u.get("streakData") or {}).get("currentStreak", {}).get("startDate"),
        "learningLanguage": u.get("learningLanguage"),
    }


def snapshot_day(now: datetime) -> str:
    """快照行的日期键:凌晨 DAY_ROLLOVER_HOUR 点前算前一天(见常量注释)。"""
    now = now.astimezone(TZ)
    if now.hour < DAY_ROLLOVER_HOUR:
        now -= timedelta(days=1)
    return now.date().isoformat()


def day_key(ts: int) -> str:
    """unix 秒 → 北京日期键。显式传时区,系统时区(本地 UTC+8 / CI UTC)不影响结果。"""
    return datetime.fromtimestamp(ts, TZ).strftime("%Y-%m-%d")


def summaries_to_daily(summaries):
    """xp_summaries 条目 → {date: {lessons, minutes, xp}}。

    lessons = numSessions(实测与 xpGains 逐课计数完全一致),minutes = totalSessionTime/60 四舍五入
    (多邻国自己记的会话时长,与 App 内显示同口径),xp = gainedXp。
    没学的天(sessions 与 xp 都为 0,例如冻结日)不产生条目——绿墙里缺 = 没学。
    """
    out = {}
    for x in summaries or []:
        ts = x.get("date")
        if ts is None:
            continue
        sessions = x.get("numSessions") or 0
        xp = x.get("gainedXp") or 0
        if sessions <= 0 and xp <= 0:
            continue
        out[day_key(int(ts))] = {
            "lessons": sessions,
            "minutes": round((x.get("totalSessionTime") or 0) / 60),
            "xp": xp,
        }
    return out


def fetch_xp_summaries(token, start: str, end: str):
    """拉 [start, end] 的按天汇总;失败返回 None(调用方据此报红,不静默提交残缺 daily)。"""
    url = f"{SUMMARY_API}?startDate={start}&endDate={end}&timezone=Asia%2FShanghai&_={int(time.time())}"
    try:
        d = get_json(url, auth=token)
    except Exception as e:
        print(f"xp_summaries fetch failed: {e}", file=sys.stderr)
        return None
    return summaries_to_daily(d.get("summaries") if isinstance(d, dict) else None)


def fetch_daily_detail(token):
    """带 JWT 拉每日明细 {date: {lessons, minutes, xp}} + 课程状态。任一接口失败返回 None。

    daily 只认 xp_summaries(真实时长、可回溯全程);用户档案(xpGains / currentCourse)
    负责单元完成日、升分日和课程状态。
    """
    try:
        # ?_= 时间戳当 cache-buster:固定值可能吃到接口缓存,当天早晨的课迟迟不进 xpGains
        u = get_json(f"{AUTH_API}?_={int(time.time())}", auth=token)
    except Exception as e:
        print(f"auth fetch failed (fallback to public only): {e}", file=sys.stderr)
        return None
    # 档案字段诊断:2026-08-15 起接口偶发不再返回 currentCourse/sessionCount/longestStreak,
    # 打出来才知道字段被挪去哪了(看 Actions 日志)
    missing = [k for k in ("currentCourse", "sessionCount", "longestStreak") if not u.get(k)]
    if missing:
        print(
            f"auth profile missing: {missing}; top-level keys: {sorted(u.keys())}",
            file=sys.stderr,
        )
    # DUOLINGO_SUMMARY_START 可指定回看起点(一次性回填全程用)
    end = datetime.now(TZ).date().isoformat()
    start = os.environ.get("DUOLINGO_SUMMARY_START") or (
        datetime.now(TZ) - timedelta(days=SUMMARY_DAYS)
    ).date().isoformat()
    detail = fetch_xp_summaries(token, start, end)
    if detail is None:
        return None
    print(f"xp_summaries {start}~{end}: {len(detail)} active days")
    unit_done, score_reached = extract_unit_progress(u.get("currentCourse"), u.get("xpGains"))
    extra = {
        "sections": fetch_course_progress(u),
        "longestStreak": u.get("longestStreak"),
        "sessionCount": u.get("sessionCount"),
        "score": extract_score_info(u.get("currentCourse")),
        "unitDone": unit_done,
        "scoreReached": score_reached,
    }
    return detail, extra


# 档案结构(2026-08-20 从 list 改为对象,公共字段提升到外层):
#   {
#     "meta":    {"username", "streakStart", "learningLanguage"},            # 真静态
#     "current": {"longestStreak", "sessionCount", "sections", "scoreMax"},  # 当前状态,页面只读这份
#     "days":    [{"date", "totalXp", "streak", "score?", "apiCoverage?"}],  # 纯时间序列,一天一行
#     "daily":   {"YYYY-MM-DD": {"lessons", "minutes", "xp"}}               # 近窗口流水账(~15 天)
#     "unitDone":     {"30": "2026-09-08"},   # 完成单元 N 的日期(逐课时间戳反推,只增不改)
#     "scoreReached": {"17": "2026-09-08"},   # 到达 N 分的日期(同上;days 行的 score 只是采集时刻的瞬时值)
#   }

META_KEYS = ("username", "streakStart", "learningLanguage")
# current 键:新值覆盖、缺失沿用旧值(接口偶发残缺档案,不能让单次坏响应打掉页面组件)
CARRY_FORWARD_KEYS = ("longestStreak", "sessionCount", "sections", "scoreMax")
# 旧 list 结构里住在每条快照上的字段(迁移时从 days 行剥掉)
LEGACY_ROW_DROP = META_KEYS + ("longestStreak", "sessionCount", "sections", "daily")


def migrate(data):
    """旧 list 结构(每日自包含快照)→ 新对象结构。已是对象则原样返回。

    状态字段归 current、时间序列归 days、各快照的 daily 合并到顶层、
    score.max(旧 delta 记录)提升为 current.scoreMax。
    """
    if isinstance(data, dict):
        return data
    last = data[-1] if data else {}
    days = []
    score_max = None
    for h in data:
        row = {k: v for k, v in h.items() if k not in LEGACY_ROW_DROP}
        score = row.get("score") or {}
        m = score.pop("max", None)
        if m is not None:
            score_max = m
        if not score:
            row.pop("score", None)
        days.append(row)
    daily = {}
    for h in data:
        daily.update(h.get("daily") or {})
    current = {
        k: last.get(k)
        for k in ("longestStreak", "sessionCount", "sections")
        if last.get(k) is not None
    }
    if score_max is not None:
        current["scoreMax"] = score_max
    meta = {k: last.get(k) for k in META_KEYS if last.get(k) is not None}
    return {"meta": meta, "current": current, "days": days, "daily": daily}


def merge_history(data: dict, payload: dict) -> dict:
    """把当天采集(payload)并进档案对象,返回新档案。

    payload = {"meta": {...}, "current": {...}, "day": {...}, "daily": {...},
               "unitDone": {...}, "scoreReached": {...}}

    规则:
      - meta 每次整体刷新(公开接口给的就是最新身份信息)
      - current 逐键新值覆盖、缺失沿用旧值(接口偶发残缺不打掉页面)
      - days 同日覆盖(一天一行,重跑覆盖),按日期升序
      - daily 按天合并,同日冲突保留 lessons 更多的一份,同数取新
        (xpGains 窗口按时间戳滚动,最老的那天重拉时只剩"边界时刻之后"的课,
        直接新覆盖旧会把完整日写成残缺日——2026-08-20 实锤:
        上午本地重跑把 8/5 从 18 课覆盖成 9 课)
      - unitDone / scoreReached 只增不改:首次算出时窗口最全,后来窗口滑动只会更残缺
    """
    data = migrate(data)
    if payload.get("meta"):
        data["meta"] = payload["meta"]
    cur = data.setdefault("current", {})
    for k in CARRY_FORWARD_KEYS:
        v = (payload.get("current") or {}).get(k)
        if v is not None:
            cur[k] = v
    day = payload["day"]
    days = [d for d in data.get("days", []) if d.get("date") != day["date"]]
    days.append(day)
    days.sort(key=lambda d: d["date"])
    data["days"] = days
    merged = dict(data.get("daily") or {})
    for d, v in (payload.get("daily") or {}).items():
        old = merged.get(d)
        # 同日冲突:正常场景是当天明细越重跑越全(新 ≥ 旧),取新;
        # 窗口边缘的截断日新 < 旧,保留旧,不能让历史缩水
        if not old or v.get("lessons", 0) >= old.get("lessons", 0):
            merged[d] = v
    data["daily"] = dict(sorted(merged.items()))
    for key in ("unitDone", "scoreReached"):
        found = dict(data.get(key) or {})
        for k, v in (payload.get(key) or {}).items():
            found.setdefault(str(k), v)
        if found:
            data[key] = dict(sorted(found.items(), key=lambda kv: int(kv[0])))
    return data


def normalize_token(raw: str) -> str:
    """剥掉手滑带上的 Bearer 前缀和首尾空白;请求头构造时会自己加前缀。"""
    raw = (raw or "").strip()
    if raw.lower().startswith("bearer "):
        raw = raw[7:]
    return raw


def main():
    now = datetime.now(TZ)
    today = snapshot_day(now)
    pub = fetch_public()
    day = {"date": today, "totalXp": pub["totalXp"], "streak": pub["streak"]}
    payload = {
        "meta": {
            k: pub.get(k)
            for k in META_KEYS
            if pub.get(k) is not None
        },
        "day": day,
    }

    # 若有 JWT,附带每日明细(xpGains 是约 15 天的滚动窗口,历史靠合并保留)
    token = normalize_token(os.environ.get("DUOLINGO_JWT") or "")
    if not token and os.environ.get("CI"):
        # CI 里没 token = Secret 没配上或 workflow 没映射上,宁可变红也不静默提交无明细快照
        raise SystemExit(
            "DUOLINGO_JWT is missing in CI: check the GitHub Secret exists and the "
            "workflow passes it via step env (see duolingo.yml fetch step)."
        )
    if token:
        result = fetch_daily_detail(token)
        if not result:
            # JWT 存在却拉失败,大概率过期:宁可让 workflow 变红,
            # 也不要静默提交一份没有明细的快照,把每日曲线悄悄断掉。
            raise SystemExit(
                "DUOLINGO_JWT is set but the auth/xp_summaries fetch failed (token likely expired). "
                "Update the GitHub Secret, then re-run this workflow."
            )
        detail, extra = result
        payload["daily"] = detail
        score = extra.get("score") or {}
        day["score"] = {
            k: score[k]
            for k in ("reached", "lastUnitDone", "bandStart", "nextAtUnit")
            if score.get(k) is not None
        }
        payload["current"] = {
            "longestStreak": extra.get("longestStreak"),
            "sessionCount": extra.get("sessionCount"),
            "sections": extra.get("sections"),
            "scoreMax": score.get("max"),
        }
        payload["unitDone"] = extra.get("unitDone") or {}
        payload["scoreReached"] = extra.get("scoreReached") or {}
        if payload["scoreReached"]:
            steps = ", ".join(f"{k}@{v}" for k, v in sorted(payload["scoreReached"].items()))
            print(f"score steps in window: {steps}")
        days = sorted(detail)
        if days:
            # 覆盖范围写进日志:接口窗口滞后时一眼可见(2026-08-16/17 断档排查了半天才发现是这)
            print(f"xpGains coverage: {days[0]} ~ {days[-1]} ({len(days)} days)")
            for d in days[-3:]:
                v = detail[d]
                print(f"  {d}: {v['xp']}xp {v['lessons']} lessons ~{v['minutes']}min")
            yesterday = (datetime.fromisoformat(today) - timedelta(days=1)).date().isoformat()
            if days[-1] < yesterday:
                print(
                    f"warning: xpGains only covers up to {days[-1]}; "
                    "missing days will be backfilled by later runs once the API catches up",
                    file=sys.stderr,
                )
            # 覆盖范围同时记进当天行:不用翻 Actions 日志,打开数据文件就能看到当时拉到了哪天
            day["apiCoverage"] = f"{days[0]}~{days[-1]}({len(days)}d)"
        t = detail.get(today)
        if t:
            print(f"today: {t['lessons']} lessons ~{t['minutes']}min {t['xp']}xp")

    data = {"meta": {}, "current": {}, "days": [], "daily": {}}
    if OUT.exists():
        data = json.loads(OUT.read_text())
    data = merge_history(data, payload)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    score_part = ""
    if day.get("score"):
        score_part = f" score={day['score']['reached']}/{payload.get('current', {}).get('scoreMax')}"
    print(f"Saved day {today}: streak={day['streak']} xp={day['totalXp']}{score_part} -> {OUT}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"fetch failed: {e}", file=sys.stderr)
        sys.exit(1)
