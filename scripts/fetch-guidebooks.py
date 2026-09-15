#!/usr/bin/env python3
"""
拉多邻国每个单元的官方指南(App 里每部分的"指南":重点语句 + 语法点)→ data/duolingo-guidebooks.json。

数据来源:登录态个人资料接口 currentCourse.pathSectioned[].units[].guidebook.url(CDN JSON,
地址带哈希,必须先拿到课程结构才知道)。元素类型:text / dialogue / example / table / verticalSpace。
文本样式规律(实测):fontSize 17 + 青色 = 分区标题(重点语句/语法点),fontSize 25 加粗 = 语法点标题,
其余是正文;正文里 fontWeight bold 的片段是讲解重点,用 **…** 保留。
重点语句(dialogue.phrases[])每句带 subtext(中文翻译)、ttsURL(整句读音 mp3,CDN 公开可访问)、
blockHints(逐词释义表,cell 带 colspan 表示词组共用一个释义);例句(example)带 subtext + ttsURL。

默认范围:当前学习所在 section 及其下一个 section 之前的所有 section(现在 = Intro + A1 两段,70 单元),
DUOLINGO_GUIDEBOOK_SECTIONS=N 可指定拉前 N 个 section。增量:已在档案里的单元不重拉,
DUOLINGO_GUIDEBOOK_REFRESH=1 强制全量重拉。

用法:DUOLINGO_JWT=… [DUOLINGO_INSECURE=1] python3 scripts/fetch-guidebooks.py
复用 fetch-duolingo.py 的 get_json / normalize_token / AUTH_API(文件名带连字符,用 importlib 加载)。
"""
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "data" / "duolingo-guidebooks.json"
TTS_BASE = "https://d1vq87e9lcf771.cloudfront.net/harrison/"  # 读音 mp3 公共前缀,文件里只存哈希(省 2/3 体积)


def tts_id(url) -> str:
    url = url or ""
    return url[len(TTS_BASE):] if url.startswith(TTS_BASE) else url

_spec = importlib.util.spec_from_file_location("fetch_duolingo", HERE / "fetch-duolingo.py")
fd = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fd)


def styled(ss) -> str:
    """styledString → 纯文本,fontWeight bold 的片段包 **…**(分区/标题整句加粗的不包)。"""
    text = ss.get("text") or ""
    styling = ss.get("styling") or []
    bold = [(s["from"], s["to"]) for s in styling if (s.get("attributes") or {}).get("fontWeight") == "bold"]
    if not bold or (len(bold) == 1 and bold[0] == (0, len(text))):
        return text
    out, pos = [], 0
    for a, b in sorted(bold):
        if a < pos:
            continue
        out.append(text[pos:a])
        out.append(f"**{text[a:b]}**")
        pos = b
    out.append(text[pos:])
    return "".join(out)


def word_hints(block_hints) -> list:
    """blockHints → [{w, hints:[…], tts}],只保留有释义的词(空格/标点丢掉)。

    hintTable.rows 的 cell 带 colspan:colspan>1 是词组整体释义(如 When does → 什么时候),
    colspan==1 且落在本词所在列的是本词释义。本词列号 = headers 里本词(小写)的位置。
    """
    out = []
    for bh in block_hints or []:
        w = bh.get("value") or ""
        ht = bh.get("hintTable") or {}
        rows = ht.get("rows") or []
        if not w.strip() or not rows:
            continue
        headers = [h.lower() for h in (ht.get("headers") or [])]
        col = headers.index(w.lower()) if w.lower() in headers else 0
        hints = []
        for row in rows:
            pos = 0
            for cell in row:
                span = cell.get("colspan") or 1
                hint = cell.get("hint")
                if hint and (span > 1 or pos == col) and hint not in hints:
                    hints.append(hint)
                pos += span
        # 单字释义(如 "什"/"时")是多邻国拆字的副产品,有更长的就丢掉
        longer = [h for h in hints if len(h) > 1]
        hints = (longer or hints)[:2]
        if hints:
            out.append({"w": w, "hints": hints, "tts": tts_id(bh.get("tts"))})
    return out


def text_kind(ss) -> str:
    """'section' = 重点语句/语法点分区标题,'title' = 语法点标题,'body' = 正文。"""
    st = (ss.get("styling") or [{}])[0].get("attributes") or {}
    if st.get("fontSize") == 17 and st.get("textColor") == "1CB0F6":
        return "section"
    if st.get("fontSize") == 25 and st.get("fontWeight") == "bold":
        return "title"
    return "body"


def parse_guidebook(doc: dict) -> dict:
    """指南 JSON → {keySentences: [{en, zh, tts, words}], grammar: [{title, blocks: [{type, ...}]}]}"""
    key_sentences, grammar = [], []
    mode = None  # 'key' | 'grammar'
    cur = None
    for el in doc.get("elements") or []:
        t = el.get("type")
        e = el.get("element")
        if t == "verticalSpace":
            continue
        if t == "text":
            ss = e.get("styledString") or {}
            kind = text_kind(ss)
            txt = ss.get("text") or ""
            if kind == "section":
                mode = "grammar" if "语法" in txt else "key"
                continue
            if mode != "grammar":
                continue
            if kind == "title":
                cur = {"title": txt, "blocks": []}
                grammar.append(cur)
                continue
            if cur is None:  # 没标题就来了正文,兜一个
                cur = {"title": "", "blocks": []}
                grammar.append(cur)
            cur["blocks"].append({"type": "text", "text": styled(ss)})
        elif t == "dialogue":
            for ph in e.get("phrases") or []:
                txt = ph.get("text") or {}
                sent = {
                    "en": styled(txt.get("styledString") or {}),
                    "zh": ((ph.get("subtext") or {}).get("styledString") or {}).get("text") or "",
                    "tts": tts_id(ph.get("ttsURL")),
                    "words": word_hints(txt.get("blockHints")),
                }
                if mode == "grammar" and cur is not None:
                    cur["blocks"].append({"type": "example", **{k: sent[k] for k in ("en", "zh", "tts")}})
                else:
                    key_sentences.append(sent)
        elif t == "example":
            en = styled((e.get("text") or {}).get("styledString") or {})
            zh = ((e.get("subtext") or {}).get("styledString") or {}).get("text") or ""
            if cur is None:
                cur = {"title": "", "blocks": []}
                grammar.append(cur)
            cur["blocks"].append({"type": "example", "en": en, "zh": zh, "tts": tts_id(e.get("ttsURL"))})
        elif t == "table":
            rows = []
            for row in e.get("cells") or e.get("rows") or []:
                rows.append([styled(c.get("styledString") or {}) if isinstance(c, dict) else str(c) for c in row])
            if cur is None:
                cur = {"title": "", "blocks": []}
                grammar.append(cur)
            cur["blocks"].append({"type": "table", "rows": rows})
        else:
            print(f"  unknown element type {t!r}, skipped", file=sys.stderr)
    return {"keySentences": key_sentences, "grammar": grammar}


def main():
    token = fd.normalize_token(os.environ.get("DUOLINGO_JWT") or "")
    if not token:
        raise SystemExit("DUOLINGO_JWT is required")
    profile = fd.get_json(f"{fd.AUTH_API}?_={int(datetime.now().timestamp())}", auth=token)
    course = profile.get("currentCourse") or {}
    sections = course.get("pathSectioned") or []
    if not sections:
        raise SystemExit("currentCourse.pathSectioned missing")

    # 当前所在 section = 第一个没全部完成的
    cur_sec = next(
        (i for i, s in enumerate(sections) if (s.get("completedUnits") or 0) < len(s.get("units") or [])),
        len(sections) - 1,
    )
    n_sections = int(os.environ.get("DUOLINGO_GUIDEBOOK_SECTIONS") or (cur_sec + 2))
    n_sections = min(n_sections, len(sections))

    existing = {}
    if OUT.exists() and not os.environ.get("DUOLINGO_GUIDEBOOK_REFRESH"):
        try:
            existing = {u["unitIndex"]: u for u in json.loads(OUT.read_text()).get("units", [])}
        except Exception as e:  # noqa: BLE001
            print(f"existing file unreadable, refetching all: {e}", file=sys.stderr)

    units_out, fetched = [], 0
    for si, sec in enumerate(sections[:n_sections]):
        cefr = (sec.get("cefr") or {}).get("level")
        for pos, un in enumerate(sec.get("units") or [], start=1):
            idx = un.get("unitIndex")
            if idx is None:
                continue
            if idx in existing:
                units_out.append(existing[idx])
                continue
            gb = (un.get("guidebook") or {}).get("url")
            if not gb:
                continue
            doc = fd.get_json(gb, auth=token)
            parsed = parse_guidebook(doc)
            units_out.append(
                {
                    "unitIndex": idx,
                    "section": si,
                    "unitInSection": pos,
                    "cefr": cefr,
                    "objective": un.get("teachingObjective") or "",
                    **parsed,
                }
            )
            fetched += 1
            print(f"unit {idx + 1:3d} ({cefr} s{si + 1}-{pos:02d}) {parsed and len(parsed['grammar'])} grammar | {un.get('teachingObjective')}")

    units_out.sort(key=lambda u: u["unitIndex"])
    out = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "ttsBase": TTS_BASE,
        "sections": [
            {"index": i, "cefr": (s.get("cefr") or {}).get("level"), "units": len(s.get("units") or [])}
            for i, s in enumerate(sections)
        ],
        "units": units_out,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(f"Saved {len(units_out)} units ({fetched} newly fetched) -> {OUT}")


if __name__ == "__main__":
    main()
