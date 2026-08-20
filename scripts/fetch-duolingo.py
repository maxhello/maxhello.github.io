#!/usr/bin/env python3
"""
拉取多邻国学习数据,追加每日快照到 data/duolingo-history.json。

两级数据源:
  1. 公开接口(无登录):streak / 总XP / 课程 —— 永远可用,保底
  2. 带 JWT(环境变量 DUOLINGO_JWT,存于 GitHub Secrets):
     逐课 xpGains 记录 → 按天聚合出每日课程数与学习时长(分钟)

一天一条,同日重跑覆盖。时长口径:相邻课程间隔<15分钟累加,末课+5分钟。
归日统一按北京时间(Asia/Shanghai),与多邻国 streak 口径一致,本地跑和 CI(UTC)结果相同。
全量 daily 只保留在最新快照,旧快照剥掉 daily,防止文件随天数平方膨胀。

用法: python3 scripts/fetch-duolingo.py
CI:  GitHub Actions 每日定时跑,自动 commit 数据文件。
"""
import json
import os
import ssl
import sys
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

USERNAME = "Hello.Max"  # 2026-08 改名,原 Max__Zhang;USER_ID 不随改名变,无需动
USER_ID = "316697694210185"  # 登录接口按 id 查询,公开接口按 username
PUBLIC_API = f"https://www.duolingo.com/2017-06-30/users?username={USERNAME}"
AUTH_API = f"https://www.duolingo.com/2017-06-30/users/{USER_ID}"
OUT = Path(__file__).resolve().parent.parent / "data" / "duolingo-history.json"

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
GAP_MAX = 15 * 60  # 相邻课程间隔超过 15 分钟不算同次学习
LAST_LESSON_MIN = 5  # 每天最后一节课的估算时长
TZ = ZoneInfo("Asia/Shanghai")  # 归日时区固定为北京时间,不随运行环境(本地/CI)漂移


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
    """从带 JWT 的完整档案提取课程进度:各 CEFR 段的单元完成情况。"""
    sections = []
    for sec in ((u.get("currentCourse") or {}).get("pathSectioned") or []):
        units = sec.get("units", [])
        if not units:
            continue
        sections.append(
            {
                "cefr": units[0].get("cefrLevel"),
                "unitsTotal": len(units),
                "unitsCompleted": sec.get("completedUnits") or 0,
            }
        )
    return sections


def extract_score_info(current_course):
    """多邻国分数(10~160,CEFR 对齐,随课程进度/关卡测量浮动)及预估下一分所需信息。

    返回字段去向:reached/lastUnitDone/nextAtUnit 进当天的 days 行 score 键,
    max(课程满分)进 current.scoreMax:
    - reached:当前分数(scoreMetadata.reachedScore,接口原值,无计算)
    - lastUnitDone:最后已完成单元的全局 unitIndex。路径线性解锁,
      每段完成的必是前 N 个单元,取第 N 个的 unitIndex
    - nextAtUnit:"完成后到达下一分"的最末单元(全局 unitIndex)。
      节点级 levelScoreInfo.reachedScore = 完成该节点后到达的分数,
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
    target = score + 1
    for sec in cc.get("pathSectioned") or []:
        units = sec.get("units") or []
        n = min(sec.get("completedUnits") or 0, len(units))
        if n > 0 and units[n - 1].get("unitIndex") is not None:
            info["lastUnitDone"] = max(info.get("lastUnitDone", 0), units[n - 1]["unitIndex"])
        for unit in units:
            for lv in unit.get("levels") or []:
                if ((lv.get("levelScoreInfo") or {}).get("reachedScore")) == target:
                    idx = unit.get("unitIndex")
                    if idx is not None:
                        info["nextAtUnit"] = max(info.get("nextAtUnit", 0), idx)
    return info


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


def day_key(ts: int) -> str:
    """unix 秒 → 北京日期键。显式传时区,系统时区(本地 UTC+8 / CI UTC)不影响结果。"""
    return datetime.fromtimestamp(ts, TZ).strftime("%Y-%m-%d")


def fetch_daily_detail(token):
    """带 JWT 拉逐课记录,聚合成 {date: {lessons, minutes, xp}}。失败返回空。"""
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
    byday = defaultdict(list)
    for g in u.get("xpGains") or []:
        byday[day_key(g["time"])].append(g)
    detail = {}
    for d, gains in byday.items():
        times = sorted(g["time"] for g in gains)
        secs = LAST_LESSON_MIN * 60
        for a, b in zip(times, times[1:]):
            if b - a < GAP_MAX:
                secs += b - a
        detail[d] = {
            "lessons": len(times),
            "minutes": round(secs / 60),
            "xp": sum(g["xp"] for g in gains),
        }
    extra = {
        "sections": fetch_course_progress(u),
        "longestStreak": u.get("longestStreak"),
        "sessionCount": u.get("sessionCount"),
        "score": extract_score_info(u.get("currentCourse")),
    }
    return detail, extra


# 档案结构(2026-08-20 从 list 改为对象,公共字段提升到外层):
#   {
#     "meta":    {"username", "streakStart", "learningLanguage"},            # 真静态
#     "current": {"longestStreak", "sessionCount", "sections", "scoreMax"},  # 当前状态,页面只读这份
#     "days":    [{"date", "totalXp", "streak", "score?", "apiCoverage?"}],  # 纯时间序列,一天一行
#     "daily":   {"YYYY-MM-DD": {"lessons", "minutes", "xp"}}               # 近窗口流水账(~15 天)
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

    payload = {"meta": {...}, "current": {...}, "day": {...}, "daily": {...}}

    规则:
      - meta 每次整体刷新(公开接口给的就是最新身份信息)
      - current 逐键新值覆盖、缺失沿用旧值(接口偶发残缺不打掉页面)
      - days 同日覆盖(一天一行,重跑覆盖),按日期升序
      - daily 按天合并,同日冲突保留 lessons 更多的一份,同数取新
        (xpGains 窗口按时间戳滚动,最老的那天重拉时只剩"边界时刻之后"的课,
        直接新覆盖旧会把完整日写成残缺日——2026-08-20 实锤:
        上午本地重跑把 8/5 从 18 课覆盖成 9 课)
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
    return data


def normalize_token(raw: str) -> str:
    """剥掉手滑带上的 Bearer 前缀和首尾空白;请求头构造时会自己加前缀。"""
    raw = (raw or "").strip()
    if raw.lower().startswith("bearer "):
        raw = raw[7:]
    return raw


def main():
    today = datetime.now(TZ).date().isoformat()
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
                "DUOLINGO_JWT is set but the auth fetch failed (token likely expired). "
                "Update the GitHub Secret, then re-run this workflow."
            )
        detail, extra = result
        payload["daily"] = detail
        score = extra.get("score") or {}
        day["score"] = {
            k: score[k] for k in ("reached", "lastUnitDone", "nextAtUnit") if score.get(k) is not None
        }
        payload["current"] = {
            "longestStreak": extra.get("longestStreak"),
            "sessionCount": extra.get("sessionCount"),
            "sections": extra.get("sections"),
            "scoreMax": score.get("max"),
        }
        days = sorted(detail)
        if days:
            # 覆盖范围写进日志:接口窗口滞后时一眼可见(2026-08-16/17 断档排查了半天才发现是这)
            print(f"xpGains coverage: {days[0]} ~ {days[-1]} ({len(days)} days)")
            for d in days[-3:]:
                v = detail[d]
                print(f"  {d}: {v['xp']}xp {v['lessons']} lessons ~{v['minutes']}min")
            yesterday = (datetime.now(TZ) - timedelta(days=1)).date().isoformat()
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
