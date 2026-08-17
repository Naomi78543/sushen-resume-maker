#!/usr/bin/env python3
"""校验来源驱动简历的数据、指标、HTML 自包含性与 PDF 完整性。"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


ALLOWED_VERIFICATION = {"source_grounded", "user_attested", "planned"}
ALLOWED_BRANDS = {"red", "blue", "green", "gray"}
STRONG_TERMS = re.compile(
    r"核心作者|maintainer|owner|主导|完全负责|架构师|committer|全球最|世界最|首个|第一",
    re.I,
)
PLANNED_MARKERS = ("计划", "规划", "当前方向", "拟", "探索", "聚焦", "下一阶段")


def add(errors: list[str], message: str) -> None:
    errors.append(message)


def iter_objects(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from iter_objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_objects(child)


def validate_data(data: dict, errors: list[str]) -> None:
    if data.get("mode") != "source_grounded":
        add(errors, "mode 必须为 source_grounded")
    if not data.get("source_title"):
        add(errors, "source_title 缺失")
    for field in ("display_notice", "show_watermark", "watermark_text", "footer_note"):
        if field in data:
            add(errors, f"成品不应包含提示或水印字段：{field}")

    profile = data.get("profile", {})
    if not profile.get("name") or not profile.get("headline"):
        add(errors, "profile.name 与 profile.headline 为必填")
    if not data.get("education") and not data.get("experience"):
        add(errors, "至少需要一段教育或经历")

    for index, exp in enumerate(data.get("experience", [])):
        for key in ("company", "team", "dates"):
            if not exp.get(key):
                add(errors, f"experience[{index}].{key} 缺失")
        if exp.get("brand", "gray") not in ALLOWED_BRANDS:
            add(errors, f"experience[{index}].brand 非法：{exp.get('brand')}")

    serialized = json.dumps(data, ensure_ascii=False)
    if re.search(r"(?<!\d)1[3-9]\d{9}(?!\d)", serialized):
        add(errors, "检测到疑似手机号码；公开版本应确认是否需要展示")

    for obj in iter_objects(data):
        text = str(obj.get("text", ""))
        if text:
            verification = obj.get("verification")
            if verification not in ALLOWED_VERIFICATION:
                add(errors, f"可见条目缺少合法 verification：{text[:40]}")
            if not obj.get("source_note"):
                add(errors, f"可见条目缺少 source_note：{text[:40]}")
            if verification == "planned" and not any(marker in text for marker in PLANNED_MARKERS):
                add(errors, f"规划条目必须使用规划时态：{text[:45]}")
            if STRONG_TERMS.search(text) and verification == "planned":
                add(errors, f"规划条目不能使用已完成的强角色词：{text[:45]}")

            metric = obj.get("metric")
            if isinstance(metric, dict):
                ratio_keys = {"numerator", "denominator", "displayed_percent"}
                if ratio_keys <= set(metric):
                    try:
                        expected = float(metric["numerator"]) / float(metric["denominator"]) * 100
                        displayed = float(metric["displayed_percent"])
                    except (TypeError, ValueError, ZeroDivisionError):
                        add(errors, f"指标字段无法计算：{text[:40]}")
                    else:
                        if not math.isclose(expected, displayed, abs_tol=0.5):
                            add(errors, f"百分比与分子分母不一致：{text[:45]}")
                if {"baseline", "result"} <= set(metric):
                    try:
                        float(metric["baseline"])
                        float(metric["result"])
                    except (TypeError, ValueError):
                        add(errors, f"baseline/result 必须是数字：{text[:40]}")

        if obj.get("url"):
            parsed = urlparse(str(obj["url"]))
            if parsed.scheme not in {"http", "https", "mailto"}:
                add(errors, f"不安全 URL：{obj['url']}")


def validate_html(path: Path, data: dict, errors: list[str]) -> None:
    if not path.exists() or path.stat().st_size < 10_000:
        add(errors, f"HTML 不存在或体积异常：{path}")
        return
    html = path.read_text(encoding="utf-8")
    if "__RESUME_JSON__" in html:
        add(errors, "HTML 仍含数据占位符")
    if re.search(r"<script[^>]+src\s*=", html, re.I):
        add(errors, "HTML 引用了外部脚本")
    if re.search(r"<link[^>]+rel=[\"']?stylesheet", html, re.I):
        add(errors, "HTML 引用了外部样式表")
    if re.search(r"watermark|satire-banner|footer-note|footer_note|不可用于求职|虚构整活", html, re.I):
        add(errors, "HTML 中残留提示、水印或旧版整活标记")
    name = str(data.get("profile", {}).get("name", ""))
    if name and name not in html:
        add(errors, "HTML 中未找到人物名")


def validate_pdf(path: Path, errors: list[str]) -> None:
    if not path.exists() or path.stat().st_size < 5_000:
        add(errors, f"PDF 不存在或体积异常：{path}")
        return
    with path.open("rb") as handle:
        if handle.read(4) != b"%PDF":
            add(errors, "PDF 文件头无效")
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        if not reader.pages:
            add(errors, "PDF 没有页面")
    except ImportError:
        pass
    except Exception as exc:
        add(errors, f"PDF 解析失败：{exc}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="校验 ASU 式来源驱动技术履历")
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--html", required=True, type=Path)
    parser.add_argument("--pdf", required=True, type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    errors: list[str] = []
    try:
        data = json.loads(args.data.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"JSON 读取失败：{exc}", file=sys.stderr)
        raise SystemExit(1)
    validate_data(data, errors)
    validate_html(args.html, data, errors)
    validate_pdf(args.pdf, errors)
    if errors:
        print("校验失败：", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        raise SystemExit(1)
    print("校验通过：来源标记、指标口径、HTML 自包含性和 PDF 完整性均正常。")


if __name__ == "__main__":
    main()
