#!/usr/bin/env python3
"""fetch-praktika.py 纯逻辑单测(不碰网络/文件)。

跑法:python3 scripts/test_fetch_praktika.py

覆盖点:
  - day_key / build_session:UTC 时间串按北京时间归日,按开始时间归日,时长 = 完成 - 开始
  - plan_units:study-plans 扁平化,isFinished/isStarted → done/doing/todo
  - merge:sessions 去重与保留窗口、daily 只重算窗口内的天(窗口外明细已裁,重算会写残)、
    aborted 次数、words 只增不改、current 缺值沿用旧值
"""
import importlib.util
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "fetch_praktika", Path(__file__).resolve().parent / "fetch-praktika.py"
)
fp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fp)


def sess(id, date, start="21:00", seconds=600, caption="x"):
    return {"id": id, "date": date, "start": start, "seconds": seconds, "caption": caption, "lessonId": "l"}


class DayKeyTest(unittest.TestCase):
    def test_utc_evening_is_next_beijing_day(self):
        self.assertEqual(fp.day_key("2026-11-11T16:30:00.123456Z"), "2026-11-12")

    def test_utc_afternoon_same_day(self):
        self.assertEqual(fp.day_key("2026-11-11T14:31:56.230901Z"), "2026-11-11")


class BuildSessionTest(unittest.TestCase):
    def test_duration_and_start_in_beijing(self):
        item = {"sessionId": "s1", "lesson": {"id": "l1", "caption": "基础句型"}}
        detail = {"createdAt": "2026-11-11T14:24:10.079429Z", "completedAt": "2026-11-11T14:31:56.230901Z"}
        s = fp.build_session(item, detail)
        self.assertEqual(s["date"], "2026-11-11")
        self.assertEqual(s["start"], "22:24")
        self.assertEqual(s["seconds"], 466)
        self.assertEqual(s["caption"], "基础句型")

    def test_lesson_crossing_midnight_belongs_to_start_day(self):
        item = {"sessionId": "s1", "lesson": {}}
        detail = {"createdAt": "2026-11-11T15:55:00Z", "completedAt": "2026-11-11T16:05:00Z"}
        self.assertEqual(fp.build_session(item, detail)["date"], "2026-11-11")


class PlanUnitsTest(unittest.TestCase):
    def test_states(self):
        raw = {"studyPlans": [{"categories": [{"name": "基础介绍", "units": [
            {"name": "a", "numLessons": 4, "isStarted": True, "isFinished": True},
            {"name": "b", "numLessons": 3, "isStarted": True, "isFinished": False},
            {"name": "c", "numLessons": 4, "isStarted": False, "isFinished": False},
        ]}]}]}
        out = fp.plan_units(raw)
        self.assertEqual([u["state"] for u in out[0]["units"]], ["done", "doing", "todo"])
        self.assertEqual(out[0]["name"], "基础介绍")


class MergeTest(unittest.TestCase):
    TODAY = "2026-12-31"

    def test_first_run(self):
        out = fp.merge({}, [sess("a", "2026-12-30", seconds=594), sess("b", "2026-12-30", "22:00", 378)],
                       {"2026-12-30": 3}, {"Hello": ("你好", "2026-12-30")}, {"streak": 1}, self.TODAY)
        self.assertEqual(out["daily"]["2026-12-30"], {"lessons": 2, "minutes": 16, "aborted": 3})
        self.assertEqual(out["meta"]["since"], "2026-12-30")
        self.assertEqual([s["id"] for s in out["sessions"]], ["b", "a"])  # 开始时间倒序
        self.assertEqual(out["words"]["Hello"], {"zh": "你好", "date": "2026-12-30"})

    def test_rerun_dedupes(self):
        first = fp.merge({}, [sess("a", "2026-12-30")], {}, {}, {}, self.TODAY)
        again = fp.merge(first, [sess("a", "2026-12-30")], {}, {}, {}, self.TODAY)
        self.assertEqual(again["daily"]["2026-12-30"]["lessons"], 1)
        self.assertEqual(len(again["sessions"]), 1)

    def test_old_sessions_pruned_but_daily_kept(self):
        data = fp.merge({}, [sess("old", "2026-11-01"), sess("old2", "2026-11-01", "22:00")], {}, {}, {}, "2026-11-02")
        out = fp.merge(data, [sess("new", "2026-12-30")], {}, {}, {}, self.TODAY)
        self.assertEqual([s["id"] for s in out["sessions"]], ["new"])
        self.assertEqual(out["daily"]["2026-11-01"]["lessons"], 2)
        self.assertEqual(out["meta"]["since"], "2026-11-01")

    def test_outside_window_day_not_rewritten_by_partial_refetch(self):
        # 窗口外的天明细已裁:哪怕这次又拉到其中一节,也不能把 2 课重算成 1 课
        data = {"daily": {"2026-11-01": {"lessons": 2, "minutes": 20}}, "sessions": []}
        out = fp.merge(data, [sess("old", "2026-11-01")], {}, {}, {}, self.TODAY)
        self.assertEqual(out["daily"]["2026-11-01"]["lessons"], 2)
        self.assertEqual(out["sessions"], [])

    def test_aborted_kept_when_not_refetched(self):
        data = fp.merge({}, [sess("a", "2026-12-29")], {"2026-12-29": 2}, {}, {}, self.TODAY)
        out = fp.merge(data, [sess("b", "2026-12-30")], {}, {}, {}, self.TODAY)
        self.assertEqual(out["daily"]["2026-12-29"]["aborted"], 2)
        self.assertNotIn("aborted", out["daily"]["2026-12-30"])

    def test_aborted_only_day(self):
        out = fp.merge({}, [], {"2026-12-30": 1}, {}, {}, self.TODAY)
        self.assertEqual(out["daily"]["2026-12-30"], {"lessons": 0, "minutes": 0, "aborted": 1})
        self.assertIsNone(out["meta"]["since"])

    def test_words_keep_first_date(self):
        data = fp.merge({}, [], {}, {"Hello": ("你好", "2026-12-01")}, {}, self.TODAY)
        out = fp.merge(data, [], {}, {"Hello": ("您好", "2026-12-30"), "Yes": ("是的", "2026-12-30")}, {}, self.TODAY)
        self.assertEqual(out["words"]["Hello"], {"zh": "你好", "date": "2026-12-01"})
        self.assertEqual(list(out["words"]), ["Hello", "Yes"])

    def test_current_missing_values_carry_forward(self):
        data = fp.merge({}, [], {}, {}, {"streak": 3, "level": "A0_1", "plan": [{"name": "x", "units": []}]}, self.TODAY)
        out = fp.merge(data, [], {}, {}, {"streak": 4, "level": None, "plan": []}, self.TODAY)
        self.assertEqual(out["current"]["streak"], 4)
        self.assertEqual(out["current"]["level"], "A0_1")
        self.assertEqual(out["current"]["plan"][0]["name"], "x")


if __name__ == "__main__":
    unittest.main(verbosity=1)
