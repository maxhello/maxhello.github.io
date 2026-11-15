"""学习数据采集入口(k3s CronJob 跑;与 API 同一个镜像)。

    python collect.py run [duolingo|praktika ...]   # 采集并存进 PostgreSQL(默认两个都跑)
    python collect.py seed <key> < file.json        # 用一份 JSON 文档覆盖库里的文档(初始导入 / 手工修数据)
    python collect.py dump <key>                    # 把库里的文档打到 stdout

采集器(collectors/)本身只认文件:读 OUT、合并、写回 OUT。这里把库里的文档落到临时文件、
把采集器的 OUT 指过去、跑完再读回来存库——采集与合并逻辑一行不改(沿用 GitHub Actions 时代的实现与单测)。

环境变量:DATABASE_URL(同 API)、DUOLINGO_JWT、PRAKTIKA_REFRESH_TOKEN(不配 = 停用 Praktika)。
任何一个数据源失败:库里的旧文档原样保留,其余数据源照跑,最后以非零退出(CronJob 显示失败)。
"""

import json
import os
import sys
import tempfile
from collections.abc import Callable
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from collectors import duolingo, praktika
from models import (
    LEARNING_DOC_KEYS,
    Base,
    LearningDocRow,
    SessionLocal,
    engine,
    utcnow,
)

TZ = ZoneInfo("Asia/Shanghai")
VERSION_RETAIN_DAYS = 90

# 数据源 → (文档 key, 采集器模块, 凭证环境变量, 没凭证时是否算失败)
SOURCES: dict[str, tuple[str, Any, str, bool]] = {
    "duolingo": ("duolingo-history", duolingo, "DUOLINGO_JWT", True),
    "praktika": ("praktika-history", praktika, "PRAKTIKA_REFRESH_TOKEN", False),
}
DOC_KEYS = LEARNING_DOC_KEYS
assert {v[0] for v in SOURCES.values()} == set(DOC_KEYS)


def latest_row(db: Session, key: str) -> LearningDocRow | None:
    return db.scalar(
        select(LearningDocRow).where(LearningDocRow.key == key, LearningDocRow.is_latest)
    )


def load_doc(db: Session, key: str) -> dict[str, Any] | None:
    row = latest_row(db, key)
    return row.doc if row else None


def save_doc(db: Session, key: str, doc: dict[str, Any], now: datetime | None = None) -> None:
    """写当天那一行(同日覆盖)并标为最新,其余行降为历史副本,清掉超期的。"""
    now = now or datetime.now(TZ)
    today = now.astimezone(TZ).date()
    day = today.isoformat()
    db.execute(
        update(LearningDocRow)
        .where(LearningDocRow.key == key, LearningDocRow.day != day)
        .values(is_latest=False)
    )
    row = db.scalar(
        select(LearningDocRow).where(LearningDocRow.key == key, LearningDocRow.day == day)
    )
    if row:
        row.doc = doc
        row.is_latest = True
        row.updated_at = utcnow()
    else:
        db.add(LearningDocRow(key=key, day=day, doc=doc, is_latest=True))
    cutoff = (today - timedelta(days=VERSION_RETAIN_DAYS)).isoformat()
    db.execute(
        delete(LearningDocRow).where(
            LearningDocRow.key == key,
            LearningDocRow.day < cutoff,
            LearningDocRow.is_latest.is_(False),
        )
    )
    db.commit()


def run_collector(module: Any, doc: dict[str, Any], main: Callable[[], None] | None = None) -> dict[str, Any]:
    """让只认文件的采集器在一份内存文档上跑一遍,返回合并后的新文档。"""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "doc.json"
        path.write_text(json.dumps(doc, ensure_ascii=False))
        saved = module.OUT
        module.OUT = path
        try:
            (main or module.main)()
        finally:
            module.OUT = saved
        return json.loads(path.read_text())


def collect_one(db: Session, source: str) -> str:
    """跑一个数据源。返回 'ok' / 'skipped';失败抛 RuntimeError,库里的文档不动。"""
    key, module, token_env, token_required = SOURCES[source]
    if not (os.environ.get(token_env) or "").strip():
        if not token_required:
            print(f"[{source}] {token_env} not set, skipped")
            return "skipped"
        raise RuntimeError(f"{token_env} is not set")
    doc = load_doc(db, key)
    if doc is None:
        # 库里没有文档时绝不从零开始采:那会丢掉全部历史。先 seed。
        raise RuntimeError(f"no '{key}' document in the database; run `collect.py seed {key}` first")
    try:
        new_doc = run_collector(module, doc)
    except SystemExit as e:  # 采集器用 SystemExit 报失败
        raise RuntimeError(str(e)) from e
    except Exception as e:
        raise RuntimeError(f"{type(e).__name__}: {e}") from e
    save_doc(db, key, new_doc)
    return "ok"


def cmd_run(sources: list[str]) -> int:
    failed = []
    with SessionLocal() as db:
        for source in sources or list(SOURCES):
            try:
                print(f"[{source}] {collect_one(db, source)}")
            except RuntimeError as e:
                print(f"[{source}] FAILED: {e}", file=sys.stderr)
                failed.append(source)
    return 1 if failed else 0


def cmd_seed(key: str) -> int:
    doc = json.load(sys.stdin)
    if not isinstance(doc, dict) or not doc:
        raise SystemExit("seed: stdin must be a non-empty JSON object")
    with SessionLocal() as db:
        save_doc(db, key, doc)
    print(f"seeded {key}: {len(json.dumps(doc, ensure_ascii=False))} chars")
    return 0


def cmd_dump(key: str) -> int:
    with SessionLocal() as db:
        doc = load_doc(db, key)
    if doc is None:
        raise SystemExit(f"dump: no '{key}' document")
    print(json.dumps(doc, ensure_ascii=False, indent=2))
    return 0


def main(argv: list[str]) -> int:
    Base.metadata.create_all(engine)
    if argv[:1] == ["run"] and all(s in SOURCES for s in argv[1:]):
        return cmd_run(argv[1:])
    if len(argv) == 2 and argv[0] in ("seed", "dump") and argv[1] in DOC_KEYS:
        return cmd_seed(argv[1]) if argv[0] == "seed" else cmd_dump(argv[1])
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
