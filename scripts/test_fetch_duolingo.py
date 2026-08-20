#!/usr/bin/env python3
"""fetch-duolingo.py 纯逻辑单测(不碰网络/文件)。

跑法:python3 scripts/test_fetch_duolingo.py
     或 python3 -m unittest discover -s scripts -p 'test_*.py'

覆盖点:
  - day_key:归日固定北京时间,与系统时区无关(本地 UTC+8 / CI UTC 结果一致)
  - migrate:旧 list 结构 → 新对象结构(状态归 current、流水账归顶层、max 提升)
  - merge_history:对象合并(days 同日覆盖升序、daily 窗口截断保护、current 沿用/覆盖、meta 刷新)
  - extract_score_info:多邻国分数/满分提取、下一分单元带取带末、完成单元数夹紧
  - normalize_token:剥掉手滑带上的 Bearer 前缀(2026-08-17 本地排查时踩过的坑)
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


class MigrateTest(unittest.TestCase):
    def test_list_to_object(self):
        # 旧 list 结构自动迁移:状态字段归 current、流水账归顶层、days 只剩时间序列
        data = [
            {
                "date": "2026-08-19",
                "totalXp": 100,
                "streak": 24,
                "username": "Hello.Max",
                "streakStart": "2026-07-27",
                "learningLanguage": "en",
                "longestStreak": 22,
                "sessionCount": 271,
                "sections": [{"cefr": "A1"}],
                "score": {"reached": 12, "lastUnitDone": 16, "nextAtUnit": 21},
                "apiCoverage": "x~y(15d)",
                "daily": {"2026-08-18": {"lessons": 5, "minutes": 30, "xp": 300}},
            }
        ]
        out = fd.migrate(data)
        self.assertEqual(
            out["meta"],
            {"username": "Hello.Max", "streakStart": "2026-07-27", "learningLanguage": "en"},
        )
        self.assertEqual(out["current"]["sections"], [{"cefr": "A1"}])
        self.assertEqual(out["current"]["sessionCount"], 271)
        self.assertEqual(out["current"]["longestStreak"], 22)
        self.assertEqual(
            out["days"],
            [
                {
                    "date": "2026-08-19",
                    "totalXp": 100,
                    "streak": 24,
                    "score": {"reached": 12, "lastUnitDone": 16, "nextAtUnit": 21},
                    "apiCoverage": "x~y(15d)",
                }
            ],
        )
        self.assertEqual(out["daily"], {"2026-08-18": {"lessons": 5, "minutes": 30, "xp": 300}})

    def test_score_max_hoisted_to_current(self):
        # 旧 delta 记录的 score.max 提升为 current.scoreMax,days 行不再带 max
        data = [
            {"date": "2026-08-16", "totalXp": 100, "streak": 21, "score": {"reached": 11, "max": 129}},
            {"date": "2026-08-17", "totalXp": 110, "streak": 22, "score": {"reached": 11}},
        ]
        out = fd.migrate(data)
        self.assertEqual(out["current"]["scoreMax"], 129)
        self.assertNotIn("max", out["days"][0]["score"])
        self.assertNotIn("max", out["days"][1]["score"])

    def test_empty_score_dropped_from_row(self):
        # 某天的 score 只有 max(理论上不该出现):剥掉 max 后整个 score 键删除
        data = [{"date": "2026-08-16", "totalXp": 100, "streak": 21, "score": {"reached": 11, "max": 129}},
                {"date": "2026-08-17", "totalXp": 110, "streak": 22, "score": {"max": 129}}]
        out = fd.migrate(data)
        self.assertNotIn("score", out["days"][1])

    def test_dict_passthrough(self):
        # 新结构原样返回
        data = {"meta": {}, "current": {}, "days": [], "daily": {}}
        self.assertIs(fd.migrate(data), data)


class MergeHistoryTest(unittest.TestCase):
    def payload(self, **kw):
        base = {
            "meta": {
                "username": "Hello.Max",
                "streakStart": "2026-07-27",
                "learningLanguage": "en",
            },
            "current": {
                "longestStreak": 25,
                "sessionCount": 324,
                "sections": [{"cefr": "A1"}],
                "scoreMax": 129,
            },
            "day": {"date": "2026-08-21", "totalXp": 200, "streak": 26, "score": {"reached": 12}},
            "daily": {"2026-08-21": {"lessons": 3, "minutes": 24, "xp": 212}},
        }
        base.update(kw)
        return base

    def test_new_day_appends_sorted(self):
        data = {"days": [{"date": "2026-08-19", "totalXp": 100, "streak": 24}]}
        out = fd.merge_history(data, self.payload())
        self.assertEqual([d["date"] for d in out["days"]], ["2026-08-19", "2026-08-21"])

    def test_same_day_rerun_replaces_row(self):
        # 同一天重跑:当天行整体被替换,只留一条
        data = {"days": [{"date": "2026-08-21", "totalXp": 150, "streak": 26}]}
        out = fd.merge_history(data, self.payload())
        self.assertEqual(len(out["days"]), 1)
        self.assertEqual(out["days"][0]["totalXp"], 200)

    def test_daily_window_edge_truncation_keeps_fuller_old(self):
        # 窗口边缘截断:重拉只含边界后的课(lessons 更少),不能覆盖完整的一天
        # (2026-08-20 实锤:上午本地重跑把 8/5 从 18 课覆盖成 9 课)
        data = {"daily": {"2026-08-05": {"lessons": 18, "minutes": 77, "xp": 802}}}
        out = fd.merge_history(
            data, self.payload(daily={"2026-08-05": {"lessons": 9, "minutes": 41, "xp": 331}})
        )
        self.assertEqual(out["daily"]["2026-08-05"]["lessons"], 18)
        self.assertEqual(out["daily"]["2026-08-05"]["xp"], 802)

    def test_daily_same_day_growth_takes_newer(self):
        # 当天明细越重跑越全:lessons 变多取新
        data = {"daily": {"2026-08-21": {"lessons": 3, "minutes": 24, "xp": 212}}}
        out = fd.merge_history(
            data, self.payload(daily={"2026-08-21": {"lessons": 27, "minutes": 91, "xp": 1569}})
        )
        self.assertEqual(out["daily"]["2026-08-21"]["lessons"], 27)

    def test_daily_same_lessons_takes_newer_xp(self):
        # lessons 持平(如接口修正了 XP):取新的
        data = {"daily": {"2026-08-21": {"lessons": 10, "minutes": 40, "xp": 500}}}
        out = fd.merge_history(
            data, self.payload(daily={"2026-08-21": {"lessons": 10, "minutes": 40, "xp": 486}})
        )
        self.assertEqual(out["daily"]["2026-08-21"]["xp"], 486)

    def test_daily_outside_window_survives(self):
        # 滑出 xpGains 窗口的旧天保留在顶层 daily
        data = {"daily": {"2026-06-20": {"lessons": 2, "minutes": 10, "xp": 30}}}
        out = fd.merge_history(data, self.payload())
        self.assertIn("2026-06-20", out["daily"])

    def test_public_only_payload_keeps_daily(self):
        # 无 JWT 的纯公开采集(没有 daily 键)不能把历史明细清掉
        data = {"daily": {"2026-08-20": {"lessons": 3, "minutes": 24, "xp": 212}}}
        out = fd.merge_history(data, self.payload(daily=None))
        self.assertIn("2026-08-20", out["daily"])

    def test_current_carry_forward_when_missing(self):
        # 接口残缺(值为 None):沿用旧值,不打掉页面;原本没有的键不凭空造
        data = {"current": {"sessionCount": 271, "sections": [{"cefr": "A1"}], "scoreMax": 129}}
        out = fd.merge_history(
            data,
            self.payload(
                current={
                    "longestStreak": None,
                    "sessionCount": None,
                    "sections": None,
                    "scoreMax": None,
                }
            ),
        )
        self.assertEqual(out["current"]["sessionCount"], 271)
        self.assertEqual(out["current"]["sections"], [{"cefr": "A1"}])
        self.assertEqual(out["current"]["scoreMax"], 129)
        self.assertNotIn("longestStreak", out["current"])

    def test_current_new_values_overwrite(self):
        # 正常拉到的值覆盖旧值
        data = {"current": {"sessionCount": 271, "scoreMax": 129}}
        out = fd.merge_history(data, self.payload())
        self.assertEqual(out["current"]["sessionCount"], 324)
        self.assertEqual(out["current"]["scoreMax"], 129)

    def test_meta_refreshed(self):
        # meta 每次整体刷新(改名等)
        data = {"meta": {"username": "Max__Zhang", "streakStart": "2026-07-27", "learningLanguage": "en"}}
        out = fd.merge_history(data, self.payload())
        self.assertEqual(out["meta"]["username"], "Hello.Max")

    def test_legacy_list_migrates_inside_merge(self):
        # 老文件直接进 merge 也能迁
        data = [{"date": "2026-08-19", "totalXp": 100, "streak": 24, "sections": [{"cefr": "A1"}]}]
        out = fd.merge_history(data, self.payload())
        self.assertEqual(out["current"]["sections"], [{"cefr": "A1"}])
        self.assertEqual(len(out["days"]), 2)


def _score_unit(idx, scores):
    """构造 pathSectioned 里的单元:levels 的 levelScoreInfo.reachedScore 依次取 scores。"""
    return {
        "unitIndex": idx,
        "levels": [{"levelScoreInfo": {"reachedScore": s}} for s in scores],
    }


class ExtractScoreInfoTest(unittest.TestCase):
    def test_extracts_score_and_max(self):
        cc = {"scoreMetadata": {"reachedScore": 12, "pathEndingScore": 129}}
        info = fd.extract_score_info(cc)
        self.assertEqual(info["reached"], 12)
        self.assertEqual(info["max"], 129)

    def test_missing_score_metadata_returns_empty(self):
        # 接口偶发缺档案:返回空 dict,当天行没分数,页面用最近一份兜底
        self.assertEqual(fd.extract_score_info({}), {})
        self.assertEqual(fd.extract_score_info({"pathSectioned": []}), {})

    def test_next_score_at_band_last_unit(self):
        # 分数按"单元带"涨:下一分(13)的带是 unit 19~21,取带末 21
        cc = {
            "scoreMetadata": {"reachedScore": 12},
            "pathSectioned": [
                {
                    "completedUnits": 0,
                    "units": [
                        _score_unit(19, [13, 13]),
                        _score_unit(20, [13]),
                        _score_unit(21, [13, 13]),
                        _score_unit(22, [14]),
                    ],
                }
            ],
        }
        self.assertEqual(fd.extract_score_info(cc)["nextAtUnit"], 21)

    def test_last_unit_done_is_nth_unit_index(self):
        # 路径线性解锁:每段完成的就是前 N 个单元,取第 N 个的 unitIndex
        cc = {
            "scoreMetadata": {"reachedScore": 12},
            "pathSectioned": [
                {
                    "completedUnits": 2,
                    "units": [_score_unit(10, [10]), _score_unit(11, [10]), _score_unit(12, [10])],
                },
                {
                    "completedUnits": 8,
                    "units": [
                        _score_unit(20, [11]),
                        _score_unit(21, [11]),
                        _score_unit(22, [11]),
                        _score_unit(23, [11]),
                        _score_unit(24, [11]),
                        _score_unit(25, [11]),
                        _score_unit(26, [12]),
                        _score_unit(27, [12]),
                        _score_unit(28, [12]),
                    ],
                },
            ],
        }
        # 第 2 段完成 8 个 → 第 8 个单元 unitIndex=27;跨段取 max
        self.assertEqual(fd.extract_score_info(cc)["lastUnitDone"], 27)

    def test_completed_units_clamped_to_unit_count(self):
        # 接口抽风 completedUnits > 单元数:夹到段内最后一个,不能下标越界
        cc = {
            "scoreMetadata": {"reachedScore": 12},
            "pathSectioned": [
                {"completedUnits": 99, "units": [_score_unit(1, [5]), _score_unit(2, [6])]}
            ],
        }
        self.assertEqual(fd.extract_score_info(cc)["lastUnitDone"], 2)

    def test_at_max_score_no_next_unit(self):
        # 满分后再无下一分:nextAtUnit 不出现
        cc = {
            "scoreMetadata": {"reachedScore": 129, "pathEndingScore": 129},
            "pathSectioned": [{"completedUnits": 1, "units": [_score_unit(1, [129])]}],
        }
        info = fd.extract_score_info(cc)
        self.assertEqual(info["reached"], 129)
        self.assertNotIn("nextAtUnit", info)


class NormalizeTokenTest(unittest.TestCase):
    def test_strips_bearer_prefix_and_whitespace(self):
        # Secret/命令行里手滑带了 Bearer 前缀或空白,都要剥掉,否则拼出 Bearer Bearer → 401
        self.assertEqual(fd.normalize_token("Bearer abc.def"), "abc.def")
        self.assertEqual(fd.normalize_token("bearer abc.def"), "abc.def")
        self.assertEqual(fd.normalize_token("  abc.def\n"), "abc.def")
        self.assertEqual(fd.normalize_token("abc.def"), "abc.def")
        self.assertEqual(fd.normalize_token(""), "")


if __name__ == "__main__":
    unittest.main()
