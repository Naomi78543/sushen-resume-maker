# 来源驱动简历数据格式

## 顶层字段

```json
{
  "mode": "source_grounded",
  "source_title": "经历来源名称",
  "profile": {},
  "education": [],
  "experience": [],
  "open_source": [],
  "projects": [],
  "awards": [],
  "skills": []
}
```

成品不使用 `display_notice`、`show_watermark`、`watermark_text` 或 `footer_note` 等免责声明字段。

## 可见条目

所有教育、背景、指标、职责、开源和项目 bullet 使用对象：

```json
{
  "text": "将固定 Search Workflow 演进为基于 ReAct 的搜索策略架构。",
  "verification": "source_grounded",
  "source_note": "晋升材料 / Search Agent 章节",
  "claim_ids": ["C-001", "C-002"]
}
```

`verification` 可取：

- `source_grounded`：用户提供的文档、简历或公开资料明确支持；
- `user_attested`：用户本人确认的内部经历；
- `planned`：当前方向或未来规划，正文必须使用规划时态。

`source_note` 必填，用于内部追踪，不展示在成品中。

`claim_ids` 在本技能中必填，用于把最终简历原句映射回 Claim Ledger，并生成对应的面试问题、压力追问与回答边界。多个 Claim 只有在共同支持同一句话时才能合并引用。

## 指标

```json
{
  "text": "主评测集准确率提升至 98.27%，SGLang 将平均耗时从 1310ms 降至 407ms。",
  "verification": "source_grounded",
  "source_note": "晋升材料 / Scheduler 章节",
  "metric": {
    "baseline": 1310,
    "result": 407,
    "unit": "ms",
    "window": "项目阶段"
  }
}
```

如果同时提供 `numerator`、`denominator`、`displayed_percent`，校验器会重算百分比；不一致会直接失败。

## 教育与经历

教育条目保留真实 `institution`、`degree`、`dates`。`program` 可放 2–4 个经官网核验的学校 Title；Title 对应的官方 URL 写入 bullet 的 `source_note`。合作学校只有在来源明确为联合项目时才使用 `partner`。

项目的 `subtitle` 优先使用 `限定模块 Owner / 0→1 / 架构演进 / 大 Scope` 结构。只有来源为独立负责或主要负责时才能写 Owner；参与项使用 `共建者/核心参与者`。

经历条目结构：

```json
{
  "company": "字节跳动",
  "team": "Aily · 大模型应用算法",
  "dates": "2025.02 - 2026.06",
  "brand": "blue",
  "tags": ["NL2SQL", "Search Agent", "Harness"],
  "projects": [
    {
      "name": "NL2SQL",
      "subtitle": "训练、强化学习与量化部署",
      "background": [],
      "impact": [],
      "responsibilities": [],
      "keywords": []
    }
  ]
}
```

`brand` 只允许 `red`、`blue`、`green`、`gray`。`page_break_before: true` 仅影响 PDF 分页。
