#!/usr/bin/env python3
"""fetch-duolingo.py 纯逻辑单测(不碰网络/文件)。

跑法:python3 scripts/test_fetch_duolingo.py
     或 python3 -m unittest discover -s scripts -p 'test_*.py'

覆盖点:
  - day_key:归日固定北京时间,与系统时区无关(本地 UTC+8 / CI UTC 结果一致)
  - merge_history:同日覆盖、窗口外旧天保留、旧快照瘦身、同日重跑替换、日期升序
"""
import importlib.util
import unittest
from datetime import datetime
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "fetch_duolingo", Path(__file__).resolve().parent / "fetch-duolingo.py"
)
fd = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fd)


class DayKeyTest(unittest.TestCase):
    def test_after_beijing_midnight_belongs_to_new_day(self):
        # 北京 16 号 00:30(UTC 仍是 15 号 16:30)必须归到 16 号
        ts = datetime(2026, 8, 16, 0, 30, tzinfo=fd.TZ).timestamp()
        self.assertEqual(fd.day_key(int(ts)), "2026-08-16")

    def test_before_beijing_midnight_stays_on_old_day(self):
        # 北京 15 号 23:30 必须归 15 号,即使 UTC 已是 16 号
        ts = datetime(2026, 8, 15, 23, 30, tzinfo=fd.TZ).timestamp()
        self.assertEqual(fd.day_key(int(ts)), "2026-08-15")


class MergeHistoryTest(unittest.TestCase):
    def test_new_day_overwrites_same_old_day(self):
        # 同一天:新拉到的值覆盖旧值
        history = [{"date": "2026-08-14", "totalXp": 100, "daily": {"2026-08-14": {"xp": 50}}}]
        snapshot = {"date": "2026-08-15", "totalXp": 200, "daily": {"2026-08-14": {"xp": 80}}}
        out = fd.merge_history(history, snapshot)
        self.assertEqual(out[-1]["daily"]["2026-08-14"]["xp"], 80)

    def test_days_outside_window_survive(self):
        # 滑出 xpGains 窗口的旧天,从旧快照带进最新快照
        history = [{"date": "2026-07-01", "totalXp": 10, "daily": {"2026-06-20": {"xp": 30}}}]
        snapshot = {"date": "2026-08-15", "totalXp": 200, "daily": {"2026-08-15": {"xp": 40}}}
        out = fd.merge_history(history, snapshot)
        self.assertIn("2026-06-20", out[-1]["daily"])

    def test_old_snapshots_slimmed(self):
        # 防膨胀:只有最新快照保留 daily,旧快照剥掉
        history = [
            {"date": "2026-08-13", "totalXp": 90, "daily": {"2026-08-13": {"xp": 9}}},
            {
                "date": "2026-08-14",
                "totalXp": 100,
                "daily": {"2026-08-13": {"xp": 9}, "2026-08-14": {"xp": 10}},
            },
        ]
        snapshot = {
            "date": "2026-08-15",
            "totalXp": 200,
            "daily": {"2026-08-14": {"xp": 10}, "2026-08-15": {"xp": 100}},
        }
        out = fd.merge_history(history, snapshot)
        self.assertEqual(len(out), 3)
        for old in out[:-1]:
            self.assertNotIn("daily", old)
        # 旧天没丢,全量住进最新快照
        self.assertIn("2026-08-13", out[-1]["daily"])

    def test_same_day_rerun_replaces_snapshot(self):
        # 同一天重跑:旧快照整体被替换
        history = [
            {"date": "2026-08-15", "totalXp": 150, "streak": 3, "daily": {"2026-08-15": {"xp": 50}}}
        ]
        snapshot = {"date": "2026-08-15", "totalXp": 200, "streak": 4, "daily": {"2026-08-15": {"xp": 100}}}
        out = fd.merge_history(history, snapshot)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["totalXp"], 200)
        self.assertEqual(out[0]["daily"]["2026-08-15"]["xp"], 100)

    def test_public_only_snapshot_keeps_daily(self):
        # 无 JWT 的纯公开快照(没有 daily 键)也要把历史明细带下去,不能断
        history = [{"date": "2026-08-14", "totalXp": 100, "daily": {"2026-08-14": {"xp": 10}}}]
        snapshot = {"date": "2026-08-15", "totalXp": 110}
        out = fd.merge_history(history, snapshot)
        self.assertEqual(out[-1]["daily"]["2026-08-14"]["xp"], 10)

    def test_missing_summary_fields_carry_forward(self):
        # 接口返回残缺档案(缺 sections/sessionCount)时,沿用上一份,不打掉页面
        history = [
            {
                "date": "2026-08-15",
                "totalXp": 100,
                "sessionCount": 221,
                "sections": [{"cefr": "A1"}],
            }
        ]
        snapshot = {"date": "2026-08-16", "totalXp": 200, "sessionCount": None}
        out = fd.merge_history(history, snapshot)
        self.assertEqual(out[-1]["sessionCount"], 221)
        self.assertEqual(out[-1]["sections"], [{"cefr": "A1"}])

    def test_present_summary_fields_not_overwritten(self):
        # 正常拉到的值不被旧值覆盖
        history = [{"date": "2026-08-15", "totalXp": 100, "sessionCount": 221}]
        snapshot = {"date": "2026-08-16", "totalXp": 200, "sessionCount": 230}
        out = fd.merge_history(history, snapshot)
        self.assertEqual(out[-1]["sessionCount"], 230)

    def test_sorted_ascending(self):
        history = [{"date": "2026-08-14"}, {"date": "2026-08-12"}]
        snapshot = {"date": "2026-08-13", "daily": {}}
        out = fd.merge_history(history, snapshot)
        self.assertEqual([h["date"] for h in out], ["2026-08-12", "2026-08-13", "2026-08-14"])


if __name__ == "__main__":
    unittest.main()
