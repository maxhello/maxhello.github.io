"""collect.py:采集器在数据库文档上跑、版本副本、失败不动旧文档(不碰网络)。"""

import json
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

import collect
from models import (
    Base,
    LearningDocRow,
    SessionLocal,
    engine,
)

TZ = ZoneInfo("Asia/Shanghai")


@pytest.fixture
def db(monkeypatch):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    monkeypatch.setenv("DUOLINGO_JWT", "jwt")
    monkeypatch.delenv("PRAKTIKA_REFRESH_TOKEN", raising=False)
    with SessionLocal() as s:
        yield s


def fake_main(module, mutate):
    """假采集器:和真的一样读 OUT、改、写回 OUT。"""

    def main():
        data = json.loads(module.OUT.read_text())
        mutate(data)
        module.OUT.write_text(json.dumps(data))

    return main


def rows(db, key):
    return db.scalars(
        select(LearningDocRow).where(LearningDocRow.key == key).order_by(LearningDocRow.day)
    ).all()


def test_run_collector_feeds_doc_through_file_and_restores_out():
    mod = collect.duolingo
    before = mod.OUT
    out = collect.run_collector(
        mod, {"days": [1]}, fake_main(mod, lambda d: d["days"].append(2))
    )
    assert out == {"days": [1, 2]}
    assert mod.OUT is before


def test_collect_saves_doc_and_version(db, monkeypatch):
    mod = collect.duolingo
    collect.save_doc(db, "duolingo-history", {"days": ["a"]})
    monkeypatch.setattr(mod, "main", fake_main(mod, lambda d: d["days"].append("b")))
    assert collect.collect_one(db, "duolingo") == "ok"
    assert collect.load_doc(db, "duolingo-history") == {"days": ["a", "b"]}
    rs = rows(db, "duolingo-history")
    assert len(rs) == 1 and rs[0].is_latest and rs[0].doc == {"days": ["a", "b"]}  # 同日覆盖


def test_collect_refuses_to_start_from_empty_database(db):
    with pytest.raises(RuntimeError, match="seed"):
        collect.collect_one(db, "duolingo")
    assert collect.load_doc(db, "duolingo-history") is None


def test_failed_collect_keeps_old_doc(db, monkeypatch):
    mod = collect.duolingo
    collect.save_doc(db, "duolingo-history", {"days": ["a"]})

    def boom():
        raise SystemExit("DUOLINGO_JWT is set but the fetch failed")  # 采集器的报错方式

    monkeypatch.setattr(mod, "main", boom)
    with pytest.raises(RuntimeError, match="fetch failed"):
        collect.collect_one(db, "duolingo")
    assert collect.load_doc(db, "duolingo-history") == {"days": ["a"]}


def test_missing_token_fails_duolingo_but_skips_praktika(db, monkeypatch):
    monkeypatch.delenv("DUOLINGO_JWT")
    collect.save_doc(db, "duolingo-history", {"days": []})
    collect.save_doc(db, "praktika-history", {"daily": {}})
    with pytest.raises(RuntimeError, match="DUOLINGO_JWT"):
        collect.collect_one(db, "duolingo")
    assert collect.collect_one(db, "praktika") == "skipped"


def test_cmd_run_continues_after_one_source_fails(db, monkeypatch):
    monkeypatch.setenv("PRAKTIKA_REFRESH_TOKEN", "rt")
    collect.save_doc(db, "praktika-history", {"daily": {}})  # 多邻国文档故意不放 → 失败
    mod = collect.praktika
    monkeypatch.setattr(mod, "main", fake_main(mod, lambda d: d["daily"].update(x=1)))
    assert collect.cmd_run([]) == 1
    assert collect.load_doc(db, "praktika-history") == {"daily": {"x": 1}}


def test_one_row_per_day_latest_flag_and_retention(db):
    key = "duolingo-history"
    collect.save_doc(db, key, {"n": 1}, datetime(2026, 1, 1, 9, tzinfo=TZ))
    collect.save_doc(db, key, {"n": 2}, datetime(2026, 1, 1, 23, tzinfo=TZ))
    collect.save_doc(db, key, {"n": 3}, datetime(2026, 1, 2, 4, tzinfo=TZ))
    assert [(r.day, r.doc["n"], r.is_latest) for r in rows(db, key)] == [
        ("2026-01-01", 2, False),
        ("2026-01-02", 3, True),
    ]
    collect.save_doc(db, key, {"n": 4}, datetime(2026, 4, 2, 9, tzinfo=TZ))  # 1/1 已超 90 天
    assert [(r.day, r.is_latest) for r in rows(db, key)] == [
        ("2026-01-02", False),
        ("2026-04-02", True),
    ]
    assert collect.load_doc(db, key) == {"n": 4}


def test_latest_flag_is_per_document(db):
    collect.save_doc(db, "duolingo-history", {"d": 1}, datetime(2026, 1, 1, 9, tzinfo=TZ))
    collect.save_doc(db, "praktika-history", {"p": 1}, datetime(2026, 1, 2, 9, tzinfo=TZ))
    assert collect.load_doc(db, "duolingo-history") == {"d": 1}  # 另一份文档更新不影响它
    assert collect.load_doc(db, "praktika-history") == {"p": 1}
