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
    }
    return detail, extra


# 慢变汇总字段:接口偶发返回残缺档案(缺课程进度/累计课数/最长连胜)时沿用上一份,
# 避免单次坏响应把页面组件打掉;下次正常响应会自然刷新
CARRY_FORWARD_KEYS = ("sections", "sessionCount", "longestStreak")


def merge_history(history: list, snapshot: dict) -> list:
    """把新快照并进历史,返回新的 history 列表(会就地给 snapshot 写入合并后的 daily)。

    规则:
      - daily 按天合并:新拉到的天覆盖同日旧值,窗口外的旧天保留
        (xpGains 只返回最近约 15 天,更早的天数只存在于旧快照里)。
      - 同日旧快照整体丢弃(一天一条,重跑覆盖),结果按日期升序。
      - 防膨胀:全量 daily 只保留在最新快照,旧快照剥掉 daily;
        页面对无明细的旧快照用 totalXp 差值兜底(见 src/pages/English.tsx)。
      - sections/sessionCount/longestStreak 缺失时沿用上一份快照的值。
    """
    prev = history[-1] if history else None
    if prev:
        for k in CARRY_FORWARD_KEYS:
            if not snapshot.get(k):
                snapshot[k] = prev.get(k)

    merged_daily: dict = {}
    for old in history:
        for d, v in (old.get("daily") or {}).items():
            merged_daily[d] = v
    for d, v in (snapshot.get("daily") or {}).items():
        merged_daily[d] = v
    if merged_daily:
        snapshot["daily"] = dict(sorted(merged_daily.items()))

    out = [
        {k: v for k, v in h.items() if k != "daily"}
        for h in history
        if h["date"] != snapshot["date"]
    ]
    out.append(snapshot)
    out.sort(key=lambda h: h["date"])
    return out


def normalize_token(raw: str) -> str:
    """剥掉手滑带上的 Bearer 前缀和首尾空白;请求头构造时会自己加前缀。"""
    raw = (raw or "").strip()
    if raw.lower().startswith("bearer "):
        raw = raw[7:]
    return raw


def main():
    today = datetime.now(TZ).date().isoformat()
    snapshot = fetch_public()
    snapshot["date"] = today

    # 若有 JWT,附带每日明细(xpGains 是约 15 天的滚动窗口,历史靠合并保留)
    token = normalize_token(os.environ.get("DUOLINGO_JWT") or "")
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
        snapshot["daily"] = detail
        snapshot["longestStreak"] = extra.get("longestStreak")
        snapshot["sessionCount"] = extra.get("sessionCount")
        snapshot["sections"] = extra.get("sections")
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
        t = detail.get(today)
        if t:
            print(f"today: {t['lessons']} lessons ~{t['minutes']}min {t['xp']}xp")

    history = []
    if OUT.exists():
        history = json.loads(OUT.read_text())

    history = merge_history(history, snapshot)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n")
    print(f"Saved snapshot {today}: streak={snapshot['streak']} xp={snapshot['totalXp']} -> {OUT}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"fetch failed: {e}", file=sys.stderr)
        sys.exit(1)
