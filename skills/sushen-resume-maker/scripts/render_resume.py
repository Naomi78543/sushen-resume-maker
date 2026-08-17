#!/usr/bin/env python3
"""从结构化 JSON 生成高密度中文技术简历 HTML 与 PDF。"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Iterable
from xml.sax.saxutils import escape


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize(value: Any) -> str:
    text = "" if value is None else str(value)
    return (
        text.replace("\u2010", "-")
        .replace("\u2011", "-")
        .replace("\u2012", "-")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2212", "-")
        .replace("\u00b7", " / ")
        .replace("👍", "点赞")
    )


def ptext(value: Any) -> str:
    return escape(normalize(value)).replace("\n", "<br/>")


def visible_text(item: Any) -> str:
    if isinstance(item, dict):
        return normalize(item.get("text", ""))
    return normalize(item)


def render_html(data: dict[str, Any], template_path: Path, output_path: Path) -> None:
    template = template_path.read_text(encoding="utf-8")
    if "__RESUME_JSON__" not in template:
        raise ValueError(f"HTML 模板缺少 __RESUME_JSON__ 占位符：{template_path}")
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(template.replace("__RESUME_JSON__", payload), encoding="utf-8")


def build_pdf(data: dict[str, Any], output_path: Path) -> None:
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.cidfonts import UnicodeCIDFont
        from reportlab.platypus import (
            KeepTogether,
            PageBreak,
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError as exc:
        raise SystemExit("缺少 reportlab。请运行：python3 -m pip install reportlab") from exc

    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
        font_name = "STSong-Light"
    except Exception:
        font_name = "Helvetica"

    palette = {
        "paper": colors.HexColor("#FFFEFA"),
        "slate": colors.HexColor("#141413"),
        "blue": colors.HexColor("#245579"),
        "link": colors.HexColor("#366F96"),
        "gray100": colors.HexColor("#F0EEE6"),
        "gray300": colors.HexColor("#D1CFC5"),
        "gray500": colors.HexColor("#87867F"),
        "gray700": colors.HexColor("#3D3D3A"),
        "redbar": colors.HexColor("#F8E8E3"),
        "bluebar": colors.HexColor("#E5F1F5"),
        "greenbar": colors.HexColor("#EAF1E5"),
        "graybar": colors.HexColor("#EFEEE9"),
        "redline": colors.HexColor("#D97757"),
        "blueline": colors.HexColor("#4C8AA5"),
        "greenline": colors.HexColor("#788C5D"),
    }

    sample = getSampleStyleSheet()
    body = ParagraphStyle(
        "正文",
        parent=sample["BodyText"],
        fontName=font_name,
        fontSize=7.65,
        leading=10.25,
        textColor=palette["slate"],
        wordWrap="CJK",
        spaceAfter=1.6,
    )
    tiny = ParagraphStyle(
        "小字",
        parent=body,
        fontSize=6.35,
        leading=8.1,
        textColor=palette["gray500"],
        spaceAfter=0,
    )
    meta = ParagraphStyle(
        "元信息",
        parent=body,
        fontSize=6.7,
        leading=8.8,
        textColor=palette["gray700"],
        alignment=TA_RIGHT,
        spaceAfter=0,
    )
    name_style = ParagraphStyle(
        "姓名",
        parent=body,
        fontSize=21,
        leading=22,
        textColor=palette["slate"],
        spaceAfter=2,
    )
    headline_style = ParagraphStyle(
        "身份主线",
        parent=body,
        fontSize=8.9,
        leading=10.8,
        textColor=palette["blue"],
        spaceAfter=0,
    )
    section_style = ParagraphStyle(
        "分区标题",
        parent=body,
        fontSize=11.6,
        leading=13.5,
        textColor=palette["blue"],
        spaceAfter=0,
    )
    company_style = ParagraphStyle(
        "公司",
        parent=body,
        fontSize=9.0,
        leading=10.6,
        textColor=palette["blue"],
        spaceAfter=0,
    )
    company_right = ParagraphStyle("公司右侧", parent=meta, textColor=palette["gray700"])
    project_style = ParagraphStyle(
        "项目",
        parent=body,
        fontSize=8.8,
        leading=10.8,
        textColor=palette["blue"],
        spaceBefore=1.5,
        spaceAfter=1.5,
        keepWithNext=True,
    )
    label_style = ParagraphStyle(
        "标签",
        parent=body,
        fontSize=7.3,
        leading=9.6,
        textColor=palette["blue"],
        spaceAfter=0,
    )
    bullet_style = ParagraphStyle(
        "项目符号",
        parent=body,
        leftIndent=3.5 * mm,
        firstLineIndent=-2.7 * mm,
        bulletIndent=0.5 * mm,
        spaceAfter=0.8,
    )
    card_style = ParagraphStyle(
        "卡片标题",
        parent=body,
        fontSize=8.4,
        leading=10.4,
        textColor=palette["blue"],
        spaceAfter=1,
    )

    profile = data.get("profile", {})
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=13 * mm,
        leftMargin=13 * mm,
        topMargin=11 * mm,
        bottomMargin=13 * mm,
        title=normalize(profile.get("name", "技术简历")),
        author=normalize(profile.get("name", "")),
    )

    def footer(canvas: Any, doc_obj: Any) -> None:
        canvas.saveState()
        canvas.setFont(font_name, 6.5)
        canvas.setFillColor(palette["gray500"])
        canvas.drawString(13 * mm, 7 * mm, normalize(profile.get("name", "技术简历")))
        canvas.drawRightString(A4[0] - 13 * mm, 7 * mm, f"{doc_obj.page}")
        canvas.restoreState()

    def section_heading(title: str) -> Table:
        return Table(
            [[Paragraph(ptext(title), section_style), ""]],
            colWidths=[33 * mm, 151 * mm],
            rowHeights=[6.2 * mm],
            style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.75, palette["blue"]),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]),
        )

    def bullet_flow(items: Iterable[Any]) -> list[Any]:
        result = []
        for item in items:
            text = visible_text(item)
            if text:
                result.append(Paragraph(ptext(text), bullet_style, bulletText="•"))
        return result

    def fact_table(label: str, items: Iterable[Any] | Any) -> Table:
        if isinstance(items, (list, tuple)):
            flows = bullet_flow(items)
        else:
            flows = [Paragraph(ptext(visible_text(items)), body)]
        return Table(
            [[Paragraph(ptext(label), label_style), flows]],
            colWidths=[20 * mm, 164 * mm],
            style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]),
        )

    contacts = []
    if profile.get("location"):
        contacts.append(normalize(profile["location"]))
    for item in profile.get("contacts", []):
        label = normalize(item.get("label", ""))
        value = normalize(item.get("value", ""))
        contacts.append((label + " " if label else "") + value)
    masthead = Table(
        [[
            [Paragraph(ptext(profile.get("name", "姓名")), name_style), Paragraph(ptext(profile.get("headline", "技术方向")), headline_style)],
            Paragraph(ptext("<br/>".join(contacts)).replace("&lt;br/&gt;", "<br/>"), meta),
        ]],
        colWidths=[113 * mm, 71 * mm],
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ("LINEBELOW", (0, 0), (-1, -1), 1.2, palette["blue"]),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]),
    )
    story: list[Any] = []
    story.extend([masthead, Spacer(1, 1.7 * mm)])

    education = data.get("education", [])
    if education:
        story.extend([section_heading("教育经历"), Spacer(1, 1.1 * mm)])
        for item in education:
            title_bits = [normalize(item.get("institution", "")), normalize(item.get("program", "")), normalize(item.get("degree", ""))]
            left = [Paragraph(ptext("｜".join(x for x in title_bits if x)), company_style)]
            meta_bits = []
            if item.get("degree_awarder"):
                meta_bits.append("学位授予方：" + normalize(item["degree_awarder"]))
            if item.get("partner"):
                meta_bits.append("合作方：" + normalize(item["partner"]) + "（" + normalize(item.get("partner_type", "合作类型未说明")) + "）")
            if meta_bits:
                left.append(Paragraph(ptext("；".join(meta_bits)), tiny))
            left.extend(bullet_flow(item.get("bullets", [])))
            table = Table(
                [[left, Paragraph(ptext(item.get("dates", "")), company_right)]],
                colWidths=[148 * mm, 36 * mm],
                style=TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EEF4F7")),
                    ("LINEBEFORE", (0, 0), (0, -1), 2.4, palette["blue"]),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]),
            )
            story.extend([table, Spacer(1, 1.0 * mm)])

    experience = data.get("experience", [])
    if experience:
        story.extend([section_heading("实习 / 工作经历"), Spacer(1, 1.1 * mm)])
        for exp in experience:
            if exp.get("page_break_before"):
                story.append(PageBreak())
            brand = normalize(exp.get("brand", "gray"))
            bg = palette.get(brand + "bar", palette["graybar"])
            line = palette.get(brand + "line", palette["gray500"])
            left_bits = [normalize(exp.get("company", ""))]
            if exp.get("team"):
                left_bits.append(normalize(exp["team"]))
            if exp.get("tags"):
                left_bits.append(" · ".join(normalize(x) for x in exp["tags"]))
            right_bits = [normalize(exp.get("dates", ""))]
            if exp.get("link", {}).get("url"):
                right_bits.append(normalize(exp["link"].get("label", "项目链接")))
            bar = Table(
                [[Paragraph(ptext("｜".join(x for x in left_bits if x)), company_style), Paragraph(ptext("｜".join(x for x in right_bits if x)), company_right)]],
                colWidths=[139 * mm, 45 * mm],
                rowHeights=[6.5 * mm],
                style=TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), bg),
                    ("LINEBEFORE", (0, 0), (0, -1), 3, line),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]),
            )
            story.append(bar)
            for project in exp.get("projects", []):
                title_text = normalize(project.get("name", ""))
                if project.get("subtitle"):
                    title_text += " - " + normalize(project["subtitle"])
                story.append(Paragraph(ptext(title_text), project_style))
                if project.get("background"):
                    story.append(fact_table("背景：", project["background"]))
                if project.get("impact"):
                    story.append(fact_table("指标与效果：", project["impact"]))
                if project.get("responsibilities"):
                    story.append(fact_table("我的职责：", project["responsibilities"]))
                if project.get("keywords"):
                    story.append(fact_table("技术关键词：", " / ".join(normalize(x) for x in project["keywords"])))
            story.append(Spacer(1, 1.4 * mm))

    def add_cards(title: str, items: list[dict[str, Any]], open_source: bool = False) -> None:
        if not items:
            return
        story.extend([section_heading(title), Spacer(1, 1.0 * mm)])
        for item in items:
            display = normalize(item.get("project" if open_source else "name", ""))
            if item.get("role"):
                display += "｜" + normalize(item["role"])
            flows: list[Any] = [Paragraph(ptext(display), card_style)]
            if item.get("scope"):
                flows.append(Paragraph(ptext(item["scope"]), body))
            flows.extend(bullet_flow(item.get("bullets", [])))
            if item.get("url"):
                flows.append(Paragraph(ptext("链接：" + normalize(item["url"])), tiny))
            card = Table(
                [[flows]],
                colWidths=[184 * mm],
                style=TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), palette["gray100"]),
                    ("LINEBEFORE", (0, 0), (0, -1), 2.4, palette["gray300"]),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]),
            )
            story.extend([card, Spacer(1, 1.0 * mm)])

    add_cards("开源贡献", data.get("open_source", []), True)
    add_cards("技术项目与沉淀", data.get("projects", []), False)

    awards = data.get("awards", [])
    skills = data.get("skills", [])
    if awards or skills:
        story.extend([section_heading("奖项与技能"), Spacer(1, 1.0 * mm)])
        award_flows = []
        for item in awards:
            text = normalize(item.get("name", ""))
            if item.get("date"):
                text += "｜" + normalize(item["date"])
            award_flows.append(Paragraph(ptext(text), body))
        skill_flows = [Paragraph(ptext(" / ".join(normalize(x) for x in skills)), body)] if skills else []
        story.append(Table(
            [[award_flows, skill_flows]],
            colWidths=[91 * mm, 93 * mm],
            style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOX", (0, 0), (-1, -1), 0.5, palette["gray300"]),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, palette["gray300"]),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]),
        ))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="生成 ASU 风格中文技术简历")
    parser.add_argument("--input", required=True, type=Path, help="简历 JSON")
    parser.add_argument("--html", required=True, type=Path, help="HTML 输出路径")
    parser.add_argument("--pdf", required=True, type=Path, help="PDF 输出路径")
    parser.add_argument("--template", type=Path, help="HTML 模板路径")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    template = args.template or Path(__file__).resolve().parents[1] / "assets" / "resume_template.html"
    data = load_json(args.input)
    render_html(data, template, args.html)
    build_pdf(data, args.pdf)
    print(f"已生成 HTML：{args.html}")
    print(f"已生成 PDF：{args.pdf}")


if __name__ == "__main__":
    main()
