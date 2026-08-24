#!/usr/bin/env python3
"""Validate repository text encoding and critical Chinese UI sentinels."""

from __future__ import annotations

import json
import sys
from pathlib import Path


TEXT_SUFFIXES = {".html", ".js", ".json", ".md", ".yml", ".yaml"}
MOJIBAKE_MARKERS = (
    "\u951f\u65a4\u62f7",
    "\u00ef\u00bf\u00bd",
    "\u00e2\u20ac",
    "\u00c3",
    "\u00c2",
    "\ufffd",
)
REQUIRED_TEXT = {
    "transform/app.js": (
        "仅支持 PDF / DOCX",
        "校对并确认原始简历文字",
        "原生文字质量不合格，切换 OCR",
    ),
    "transform/index.html": (
        "校对原始简历文字",
        "解析原文（可直接修正错字、断行和乱码）",
        "确认原文并识别结构",
        "照片候选与裁剪",
        "确认实习中的项目边界",
    ),
    "editor/app.js": (
        "自动识别重点词",
        "公司旁作品链接",
        "候选人照片",
    ),
    "skills/sushen-resume-maker/assets/resume_template.html": (
        "实习 / 工作经历",
        "背景：",
        "指标与效果：",
        "我的职责：",
        "技术关键词：",
        "专业评价 / 外部认可",
    ),
}

FORBIDDEN_TEXT = {
    "skills/sushen-resume-maker/assets/resume_template.html": (
        "关键动作 / 方法：",
        "背景与目标",
        "数据与指标",
    ),
}


def fail(message: str) -> None:
    print(f"ERROR: {message}")


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    errors = 0
    checked = 0

    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        relative = path.relative_to(root).as_posix()
        raw = path.read_bytes()
        if raw.startswith(b"\xef\xbb\xbf"):
            fail(f"{relative} contains a UTF-8 BOM; save as UTF-8 without BOM")
            errors += 1
        try:
            text = raw.decode("utf-8", errors="strict")
        except UnicodeDecodeError as exc:
            fail(f"{relative} is not valid UTF-8: {exc}")
            errors += 1
            continue
        checked += 1
        for marker in MOJIBAKE_MARKERS:
            if marker in text:
                escaped = marker.encode("unicode_escape").decode("ascii")
                fail(f"{relative} contains mojibake marker {escaped}")
                errors += 1
        if path.suffix.lower() == ".json":
            try:
                json.loads(text)
            except json.JSONDecodeError as exc:
                fail(f"{relative} is invalid JSON: {exc}")
                errors += 1
        if path.suffix.lower() == ".html" and "<meta charset=\"utf-8\">" not in text.lower():
            fail(f"{relative} is missing <meta charset=\"utf-8\">")
            errors += 1

    for relative, sentinels in REQUIRED_TEXT.items():
        path = root / relative
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            fail(f"cannot read required file {relative}: {exc}")
            errors += 1
            continue
        for sentinel in sentinels:
            if sentinel not in text:
                fail(f"{relative} lost critical Chinese text {sentinel!r}")
                errors += 1

    for relative, sentinels in FORBIDDEN_TEXT.items():
        path = root / relative
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            fail(f"cannot read required file {relative}: {exc}")
            errors += 1
            continue
        for sentinel in sentinels:
            if sentinel in text:
                fail(f"{relative} still contains retired A4 label {sentinel!r}")
                errors += 1

    if errors:
        print(f"UTF-8 validation failed: {errors} error(s), {checked} file(s) checked")
        return 1
    print(f"UTF-8 validation passed: {checked} file(s) checked")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

